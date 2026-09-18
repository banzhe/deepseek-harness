import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const DIST_ROOT = fileURLToPath(new URL('../dist', import.meta.url))

it('ships install metadata with the built web application', async () => {
  const index = await readFile(join(DIST_ROOT, 'index.html'), 'utf8')
  expect(index).toContain('<link rel="manifest" href="./manifest.webmanifest" />')

  const manifest: unknown = JSON.parse(await readFile(join(DIST_ROOT, 'manifest.webmanifest'), 'utf8'))
  expect(manifest).toEqual({
    id: '/',
    name: 'DeepSeek Harness',
    short_name: 'DSH',
    start_url: '/',
    scope: '/',
    display: 'fullscreen',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  })
})

it('ships the rounded tab and launcher icons beside the opaque platform-masked set', async () => {
  // A rounded icon carries transparent corners, so it must never be declared
  // `maskable`: the platform mask would cut a second shape inside the first.
  // Rounded assets are PNG color type 6 (truecolor with alpha), masked ones 2.
  const pngs: [string, number][] = [
    ['icon-192.png', 6],
    ['icon-512.png', 6],
    ['icon-maskable-192.png', 2],
    ['icon-maskable-512.png', 2],
    ['apple-touch-icon.png', 2],
  ]
  for (const [name, colorType] of pngs) {
    const bytes = await readFile(join(DIST_ROOT, name))
    expect([bytes[0], bytes.subarray(1, 4).toString('latin1')], name).toEqual([0x89, 'PNG'])
    expect(bytes[25], name).toBe(colorType)
  }
  expect([...(await readFile(join(DIST_ROOT, 'favicon.ico'))).subarray(0, 4)]).toEqual([0x00, 0x00, 0x01, 0x00])
  // The retired SVG mark must not linger and shadow the raster set.
  await expect(readFile(join(DIST_ROOT, 'favicon.svg'))).rejects.toThrow()
})
