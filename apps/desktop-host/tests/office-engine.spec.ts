import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire, type ModuleHooks } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { installOfficeEngineResolution, windowsOfficeAlias } from '../src/office-engine.ts'

const roots: string[] = []
const hooks: ModuleHooks[] = []
afterEach(() => {
  for (const hook of hooks.splice(0)) hook.deregister()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture(runtimeName = 'dsh') {
  const root = mkdtempSync(join(tmpdir(), 'desktop-office-resolution-'))
  roots.push(root)
  const runtime = join(root, 'app.asar', runtimeName)
  const manifest = 'node_modules/@deepseek-ai/libreoffice-kit-darwin-arm64/package.json'
  for (const base of [runtime, join(root, 'app.asar.unpacked', runtimeName)]) {
    const path = join(base, manifest)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify({ name: '@deepseek-ai/libreoffice-kit-darwin-arm64', path: realpathSync(dirname(path)) }))
  }
  const api = join(runtime, 'node_modules/@deepseek-ai/libreoffice-kit/package.json')
  mkdirSync(dirname(api), { recursive: true })
  writeFileSync(api, '{"name":"@deepseek-ai/libreoffice-kit"}')
  const require: (specifier: string) => unknown = createRequire(join(runtime, 'package.json'))
  const hook = installOfficeEngineResolution(runtime)!
  hooks.push(hook)
  return { root, runtime, manifest, require }
}

it('resolves engine manifests to physical directories and leaves unrelated modules alone', () => {
  const f = fixture()
  // Node 24.13 require.resolve bypasses hooks; Electron's require.resolve is covered by packaged Office smoke.
  expect(f.require('@deepseek-ai/libreoffice-kit-darwin-arm64/package.json'))
    .toMatchObject({ path: realpathSync(dirname(join(f.root, 'app.asar.unpacked', 'dsh', f.manifest))) })
  expect((f.require('node:fs') as typeof import('node:fs')).realpathSync).toBe(realpathSync)
  expect(f.require('@deepseek-ai/libreoffice-kit/package.json')).toEqual({ name: '@deepseek-ai/libreoffice-kit' })
})

it('rejects an engine missing from the unpacked tree instead of using its archived copy', () => {
  const f = fixture()
  rmSync(join(f.root, 'app.asar.unpacked'), { recursive: true })
  expect(() => { f.require('@deepseek-ai/libreoffice-kit-darwin-arm64/package.json') }).toThrow()
})

it('leaves a prepared runtime without an archive unchanged', () => {
  const root = mkdtempSync(join(tmpdir(), 'desktop-office-prepared-'))
  roots.push(root)
  expect(installOfficeEngineResolution(join(root, 'dsh'))).toBeUndefined()
})

it('preserves a renamed runtime directory when locating the unpacked engine', () => {
  const f = fixture('alternate-runtime')
  expect(f.require('@deepseek-ai/libreoffice-kit-darwin-arm64/package.json'))
    .toMatchObject({ path: realpathSync(dirname(join(f.root, 'app.asar.unpacked', 'alternate-runtime', f.manifest))) })
})

it('resolves an engine through a directory alias', () => {
  const f = fixture()
  const alias = join(f.root, 'alias')
  symlinkSync(join(f.root, 'app.asar'), alias, 'junction')
  const require: (specifier: string) => unknown = createRequire(join(alias, 'dsh', 'package.json'))
  expect(require('@deepseek-ai/libreoffice-kit-darwin-arm64/package.json'))
    .toMatchObject({ path: realpathSync(dirname(join(f.root, 'app.asar.unpacked', 'dsh', f.manifest))) })
})

it('rejects an engine resolved elsewhere inside the archive', () => {
  const f = fixture()
  const other = join(f.root, 'app.asar', 'other', f.manifest)
  mkdirSync(dirname(other), { recursive: true })
  writeFileSync(other, '{}')
  const require = createRequire(join(f.root, 'app.asar', 'other', 'package.json'))
  expect(() => { require('@deepseek-ai/libreoffice-kit-darwin-arm64/package.json') })
    .toThrow('outside the runtime package directory')
})

it('leaves external engines and the archived WASM engine at their own locations', () => {
  const f = fixture()
  const external = join(f.root, 'external', f.manifest)
  const wasm = join(f.runtime, 'node_modules/@deepseek-ai/libreoffice-kit-wasm/package.json')
  for (const path of [external, wasm]) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify({ path: realpathSync(dirname(path)) }))
  }
  const require: (specifier: string) => unknown = createRequire(join(f.root, 'external', 'package.json'))
  expect(require('@deepseek-ai/libreoffice-kit-darwin-arm64/package.json'))
    .toMatchObject({ path: realpathSync(dirname(external)) })
  expect(f.require('@deepseek-ai/libreoffice-kit-wasm/package.json'))
    .toMatchObject({ path: realpathSync(dirname(wasm)) })
})

/** Packaged runtime whose unpacked `dsh` sits under a long path. */
function aliasRuntime(root: string, pad = 'x'.repeat(150)) {
  const runtime = join(root, pad, 'app.asar', 'dsh')
  const unpacked = join(root, pad, 'app.asar.unpacked', 'dsh')
  mkdirSync(join(unpacked, 'node_modules', '@deepseek-ai', `libreoffice-kit-${process.platform}-${process.arch}`), { recursive: true })
  mkdirSync(runtime, { recursive: true })
  return { runtime, unpacked }
}

/** Run a body with LOCALAPPDATA pointed at a test-owned directory. */
function withLocalAppData(home: string, body: () => void): void {
  const previous = process.env.LOCALAPPDATA
  mkdirSync(home, { recursive: true })
  process.env.LOCALAPPDATA = home
  try {
    body()
  } finally {
    if (previous === undefined) delete process.env.LOCALAPPDATA
    else process.env.LOCALAPPDATA = previous
  }
}

it('publishes a short Windows alias entry for an over-long engine path', () => {
  const root = mkdtempSync(join(tmpdir(), 'desktop-office-alias-'))
  roots.push(root)
  const { runtime, unpacked } = aliasRuntime(root)
  withLocalAppData(join(root, 'local'), () => {
    if (process.platform !== 'win32') {
      expect(windowsOfficeAlias(runtime)).toBeUndefined()
      return
    }
    const entry = windowsOfficeAlias(runtime)!
    // The junction must reach the real engine tree so the native helper finds its resources.
    const nodeModules = join(dirname(entry), 'node_modules')
    expect(realpathSync(nodeModules)).toBe(realpathSync(join(unpacked, 'node_modules')))
    expect(statSync(join(nodeModules, '@deepseek-ai', `libreoffice-kit-${process.platform}-${process.arch}`)).isDirectory()).toBe(true)
    expect(entry.length).toBeLessThan(160)
    // Node resolves an imported package to its physical path, so the entry must preserve the alias.
    const source = readFileSync(entry, 'utf8')
    expect(source).toContain('--preserve-symlinks')
    expect(source).toContain('libreoffice-kit/lib/cli.js')
  })
})

it('publishes no alias when the engine path already fits, and fails loud when none is short enough', () => {
  const root = mkdtempSync(join(tmpdir(), 'desktop-office-short-'))
  roots.push(root)
  const fits = aliasRuntime(root, 'short')
  withLocalAppData(join(root, 'local'), () => {
    expect(windowsOfficeAlias(fits.runtime)).toBeUndefined()
  })
  const overLong = aliasRuntime(root)
  withLocalAppData(join(root, 'y'.repeat(200)), () => {
    if (process.platform !== 'win32') {
      expect(windowsOfficeAlias(overLong.runtime)).toBeUndefined()
      return
    }
    expect(() => { windowsOfficeAlias(overLong.runtime) }).toThrow('no short Windows path')
  })
})
