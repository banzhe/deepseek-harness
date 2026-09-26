/**
 * Render the Desktop application icons and the Windows tray bitmaps from `resources/icon.png`.
 *
 * Every export carries the same 22% corner radius as the Web launcher icons, so the taskbar, the
 * macOS Dock, and the tray show one shape. The Windows export is full bleed; the macOS export
 * leaves the transparent margin its legacy ICNS packaging expects.
 *
 * The committed artifacts are the outputs; rerun `pnpm run render:icons` in `apps/desktop` after
 * changing the source artwork.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { packIco, TRAY_ICON_PATHS, TRAY_ICON_SIZES } from './render-tray-icon.ts'

/** Edge length of the committed source artwork and of the Windows PNG export. */
export const ICON_EDGE = 1024

/** Corner radius as a fraction of the edge, matching the rounded Web launcher icons. */
export const ICON_CORNER_FRACTION = 0.22

/** Transparent margin the macOS export leaves around the tile, as a fraction of the edge. */
export const MACOS_TILE_FRACTION = 0.8046875

/** Committed source artwork and the platform exports rendered from it. */
export const ICON_PATHS = {
  source: fileURLToPath(new URL('../resources/icon.png', import.meta.url)),
  windows: fileURLToPath(new URL('../resources/icon-windows.png', import.meta.url)),
  macos: fileURLToPath(new URL('../resources/icon-macos.png', import.meta.url)),
} as const

/** Committed artifact and the bytes `pnpm run render:icons` writes to it. */
export interface RenderedIcon {
  readonly path: string
  readonly bytes: Buffer
}

/**
 * Corner radius for one edge length.
 * @param edge - Edge length in pixels.
 * @returns the radius in pixels.
 */
export function cornerRadius(edge: number): number {
  return Math.round(edge * ICON_CORNER_FRACTION)
}

/**
 * Scale the source to one square edge and cut its corners.
 * @param source - Image bytes; a non-square source is center-cropped to a square first.
 * @param edge - Output edge in pixels.
 * @returns PNG bytes whose corners are transparent.
 */
export async function roundedTile(source: Buffer, edge: number): Promise<Buffer> {
  const scaled = await sharp(source).resize(edge, edge, { fit: 'cover' }).png().toBuffer()
  const radius = cornerRadius(edge)
  const mask = Buffer.from(
    `<svg width="${String(edge)}" height="${String(edge)}">`
    + `<rect width="${String(edge)}" height="${String(edge)}" rx="${String(radius)}" ry="${String(radius)}" fill="#fff"/></svg>`,
  )
  return sharp(scaled).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
}

/**
 * Render the platform exports and the tray bitmaps without writing them.
 * @param source - Square source artwork bytes.
 * @returns the committed paths with the bytes each one holds.
 */
export async function renderIconArtifacts(source: Buffer): Promise<RenderedIcon[]> {
  const macEdge = Math.round(ICON_EDGE * MACOS_TILE_FRACTION)
  const [windows, macTile, tray] = await Promise.all([
    roundedTile(source, ICON_EDGE),
    roundedTile(source, macEdge),
    Promise.all(TRAY_ICON_SIZES.map(async size => ({ size, png: await roundedTile(source, size) }))),
  ])
  const offset = Math.round((ICON_EDGE - macEdge) / 2)
  const macos = await sharp({ create: { width: ICON_EDGE, height: ICON_EDGE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: macTile, left: offset, top: offset }]).png().toBuffer()
  return [
    { path: ICON_PATHS.windows, bytes: windows },
    { path: ICON_PATHS.macos, bytes: macos },
    { path: TRAY_ICON_PATHS.output, bytes: packIco(tray) },
  ]
}

/**
 * Render the committed artifacts from the committed source artwork.
 * @returns the written paths with their byte length.
 */
export async function renderApplicationIcons(): Promise<{ path: string; bytes: number }[]> {
  const rendered = await renderIconArtifacts(await readFile(ICON_PATHS.source))
  await Promise.all(rendered.map(async icon => writeFile(icon.path, icon.bytes)))
  return rendered.map(icon => ({ path: icon.path, bytes: icon.bytes.length }))
}

async function main(): Promise<void> {
  for (const icon of await renderApplicationIcons()) {
    console.info(`desktop icon: wrote ${icon.path} (${String(icon.bytes)} bytes)`)
  }
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) await main()
