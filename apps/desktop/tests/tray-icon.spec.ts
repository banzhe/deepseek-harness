import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { cornerRadius, ICON_EDGE, ICON_PATHS, MACOS_TILE_FRACTION, renderIconArtifacts } from '../scripts/render-app-icons.ts'
import { packIco, TRAY_ICON_PATHS, TRAY_ICON_SIZES, unpackIco, type IcoEntry } from '../scripts/render-tray-icon.ts'

/** Smallest valid-looking PNG stream: signature plus an IHDR chunk declaring the given edge. */
function pngStub(width: number, height = width): Buffer {
  const png = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png)
  png.writeUInt32BE(13, 8)
  png.write('IHDR', 12)
  png.writeUInt32BE(width, 16)
  png.writeUInt32BE(height, 20)
  return png
}

/** Alpha channel of one PNG as a reader plus the image edge. */
async function alphaOf(bytes: Buffer): Promise<{ edge: number; alpha: (x: number, y: number) => number }> {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { edge: info.width, alpha: (x, y) => data[(y * info.width + x) * info.channels + 3]! }
}

/** First x in one row whose alpha is opaque, or -1 when the row stays transparent. */
function firstOpaque(alpha: (x: number, y: number) => number, y: number, edge: number): number {
  for (let x = 0; x < edge; x++) if (alpha(x, y) > 200) return x
  return -1
}

/** x where a circular corner arc of the given radius meets one row. */
function arcAt(radius: number, y: number): number {
  return radius - Math.sqrt(radius * radius - (radius - y) * (radius - y))
}

describe('tray icon packaging', () => {
  it('packs PNG entries into a Vista-style ICO directory and reads them back', () => {
    const entries: IcoEntry[] = [{ size: 16, png: pngStub(16) }, { size: 256, png: pngStub(256) }]
    const ico = packIco(entries)
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBe(2)
    // 256 px is encoded as 0 in the one-byte edge fields.
    expect([ico.readUInt8(6 + 16), ico.readUInt8(6 + 17)]).toEqual([0, 0])
    expect(ico.readUInt32LE(6 + 12)).toBe(6 + 32)
    expect(unpackIco(ico)).toEqual(entries)
  })

  it('rejects bitmaps that disagree with their declared edge, oversized edges, and non-PNG data', () => {
    expect(() => packIco([{ size: 16, png: pngStub(24) }])).toThrow('is 24x24, expected 16')
    expect(() => packIco([{ size: 512, png: pngStub(512) }])).toThrow('unsupported bitmap edge 512')
    expect(() => packIco([{ size: 16, png: Buffer.from('not a png stream, long enough to be read') }])).toThrow('not a PNG stream')
    expect(() => unpackIco(Buffer.from('BM'))).toThrow('not an ICO file')
    const forged = packIco([{ size: 16, png: pngStub(16) }])
    forged.writeUInt8(20, 6)
    expect(() => unpackIco(forged)).toThrow('declares 20 but holds 16x16')
  })

  it('ships one crisp bitmap per supported display scale in the committed tray icon', () => {
    const entries = unpackIco(readFileSync(TRAY_ICON_PATHS.output))
    expect(entries.map(entry => entry.size)).toEqual([...TRAY_ICON_SIZES])
    for (const entry of entries) expect(entry.png.length).toBeGreaterThan(100)
  })
})

describe('desktop application icons', () => {
  it('commits the source artwork as the square, opaque image the exports are cut from', async () => {
    const source = await alphaOf(readFileSync(ICON_PATHS.source))
    expect(source.edge).toBe(ICON_EDGE)
    expect([source.alpha(0, 0), source.alpha(source.edge - 1, 0)]).toEqual([255, 255])
  })

  it('cuts the Windows export to a rounded, transparent tile', async () => {
    const { edge, alpha } = await alphaOf(readFileSync(ICON_PATHS.windows))
    expect(edge).toBe(ICON_EDGE)
    const radius = cornerRadius(ICON_EDGE)
    // Outside the corner arc the tile is transparent; the top edge and the tile body stay opaque.
    expect([alpha(0, 0), alpha(edge - 1, 0), alpha(0, edge - 1), alpha(edge - 1, edge - 1)]).toEqual([0, 0, 0, 0])
    expect([alpha(edge / 2, 0), alpha(0, edge / 2), alpha(edge / 2, edge / 2)]).toEqual([255, 255, 255])
    // Each row's first opaque pixel tracks the 22% corner arc the Web launcher icons use. The
    // tolerance covers antialiasing, whose absolute width grows with the larger export.
    const tolerance = Math.ceil(edge * 0.012)
    for (const y of [0, 10, 30, 60, 100]) {
      expect(Math.abs(firstOpaque(alpha, y, edge) - arcAt(radius, y)), `y=${String(y)}`).toBeLessThan(tolerance)
    }
    expect(firstOpaque(alpha, radius, edge)).toBe(0)
  })

  it('keeps the macOS export inset on a transparent canvas so the platform mask cuts one shape', async () => {
    const { edge, alpha } = await alphaOf(readFileSync(ICON_PATHS.macos))
    expect(edge).toBe(ICON_EDGE)
    const margin = Math.round((ICON_EDGE - Math.round(ICON_EDGE * MACOS_TILE_FRACTION)) / 2)
    expect([alpha(0, 0), alpha(edge - 1, edge - 1), alpha(edge / 2, margin - 1)]).toEqual([0, 0, 0])
    expect([alpha(margin + 1, edge / 2), alpha(edge - margin - 2, edge / 2), alpha(edge / 2, edge - margin - 2)])
      .toEqual([255, 255, 255])
  })

  it('reproduces the committed exports from the committed source', async () => {
    const rendered = await renderIconArtifacts(readFileSync(ICON_PATHS.source))
    expect(rendered.map(icon => icon.path)).toEqual([ICON_PATHS.windows, ICON_PATHS.macos, TRAY_ICON_PATHS.output])
    for (const icon of rendered) expect(icon.bytes.equals(readFileSync(icon.path)), icon.path).toBe(true)
  })
})
