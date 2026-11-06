import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RUNTIME_DEV_ASSET_IGNORES } from './executable-packaging.ts'

const root = resolve(import.meta.dirname, '..')
const script = resolve(root, 'scripts/build-exe-for-python-sdk.ts')
/** Asset globs that keep one file kind the carriers load at runtime. */
const RUNTIME_ASSET_GLOBS = [
  'node_modules/**/*.js', 'node_modules/**/*.cjs', 'node_modules/**/*.mjs', 'node_modules/**/*.json',
  'node_modules/**/*.node', 'node_modules/**/*.yaml', 'node_modules/**/*.md',
]

interface DryRun {
  /** Exit status of the packaging dry run. */
  readonly status: number | null
  /** Printed package manifest patch. */
  readonly stdout: string
}

let cached: DryRun | undefined

/** Run the packaging dry run once; every assertion reads the same printed config. */
function packagingDryRun(): DryRun {
  if (cached === undefined) {
    const result = spawnSync(process.execPath, [
      '--import',
      'tsx/esm',
      script,
      '--skip-build',
      '--dry-run',
      '--targets=node24-macos-arm64',
    ], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, npm_execpath: 'C:\\tools\\pnpm.cjs' },
    })
    cached = { status: result.status, stdout: result.stdout }
  }
  return cached
}

describe('Python runtime executable assets', () => {
  it('packages the dynamically resolved web frontend distribution', () => {
    const { status, stdout } = packagingDryRun()

    expect(status).toBe(0)
    expect(stdout).toContain('node_modules/**/dsh-web-frontend/dist/**/*')
    expect(stdout).toContain('node_modules/@deepseek-ai/dsh-*/**/*.{svg,png,jpg,jpeg,webp}')
    expect(stdout).not.toContain('skill-badge/assets/**/*')
    expect(stdout).toContain('node_modules/@deepseek-ai/dsh-sandbox-windows-acl/assets/**/*')
    expect(stdout).not.toContain('node_modules/**/*.py')
  })

  it('excludes development payloads without dropping a runtime file kind', () => {
    const { stdout } = packagingDryRun()

    for (const glob of RUNTIME_ASSET_GLOBS) expect(stdout).toContain(glob)
    for (const pattern of RUNTIME_DEV_ASSET_IGNORES) expect(stdout).toContain(pattern)
    // pkg matches `ignore` against absolute paths, and a bare extension wildcard here would
    // remove a runtime file kind instead of a package's development payloads.
    for (const pattern of RUNTIME_DEV_ASSET_IGNORES) expect(pattern.startsWith('**/node_modules/**/')).toBe(true)
  })
})
