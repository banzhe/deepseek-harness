/** The pnpm-patched pkg writes its SEA archive at the Brotli quality DSH_PKG_BROTLI_QUALITY selects. */

import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const pkgRoot = dirname(require.resolve('@yao-pkg/pkg/package.json'))
/** pkg's `CompressType.Brotli`, the only codec whose archive carries a quality. */
const BROTLI = 2

interface BuildRecord {
  /** Source path pkg streams the entry from when the walker never loaded its body. */
  readonly file: string
  /** Walker record slots, addressed by pkg's `STORE_*` indices. */
  [slot: number]: unknown
}

const store = require(join(pkgRoot, 'lib-es5/common.js')) as { readonly STORE_CONTENT: number; readonly STORE_STAT: number }
const { generateSeaAssets } = require(join(pkgRoot, 'lib-es5/sea-assets.js')) as {
  generateSeaAssets: (
    records: Record<string, BuildRecord>,
    entrypoint: string,
    symlinks: Record<string, string>,
    directory: string,
    options: { readonly doCompress: number },
  ) => Promise<{ readonly assets: Record<string, string> }>
}

/** A repeated-line corpus large enough that the quality setting changes the archive size. */
const PAYLOAD = Array.from({ length: 1024 }, (_unused, index) => `entry ${index} of the packaged runtime payload ${index % 7}\n`).join('')
/** Fixture path inside pkg's snapshot, shared by every record map. */
const FIXTURE_KEY = '/snapshot/fixture.txt'

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

/**
 * Compress the fixture through pkg's build-side archive writer.
 * @param quality - the `DSH_PKG_BROTLI_QUALITY` value; `undefined` leaves the variable unset.
 * @returns The archive bytes the build would embed.
 */
async function archive(quality: string | undefined): Promise<Buffer> {
  const directory = mkdtempSync(join(tmpdir(), 'pkg-brotli-quality-'))
  directories.push(directory)
  const fixture = join(directory, 'fixture.txt')
  writeFileSync(fixture, PAYLOAD)
  const record: BuildRecord = { file: fixture }
  record[store.STORE_CONTENT] = true
  record[store.STORE_STAT] = { size: PAYLOAD.length, isFileValue: true, isDirectoryValue: false }
  const previous = process.env.DSH_PKG_BROTLI_QUALITY
  if (quality === undefined) delete process.env.DSH_PKG_BROTLI_QUALITY
  else process.env.DSH_PKG_BROTLI_QUALITY = quality
  try {
    const result = await generateSeaAssets({ [FIXTURE_KEY]: record }, FIXTURE_KEY, {}, directory, { doCompress: BROTLI })
    return readFileSync(Object.values(result.assets)[0]!)
  } finally {
    if (previous === undefined) delete process.env.DSH_PKG_BROTLI_QUALITY
    else process.env.DSH_PKG_BROTLI_QUALITY = previous
  }
}

describe('pkg SEA Brotli quality', () => {
  it('keeps the fast quality 6 default that a local executable build relies on', async () => {
    const byDefault = await archive(undefined)
    const explicitSix = await archive('6')

    expect(byDefault.equals(explicitSix)).toBe(true)
  })

  it('compresses smaller when the release selects quality 11', async () => {
    const six = await archive('6')
    const eleven = await archive('11')

    expect(eleven.length).toBeLessThan(six.length)
  })

  it.each(['12', 'loud', '-1'])('rejects the quality %s instead of building an archive', async (quality) => {
    await expect(archive(quality)).rejects.toThrow('DSH_PKG_BROTLI_QUALITY must be an integer 0-11')
  })
})
