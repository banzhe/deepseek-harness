/** The npm package assembler forwards compression choices to the executable build. */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const script = resolve(root, 'scripts/build-npm-exe.ts')

/**
 * Run the assembler's dry run, which prints the upstream build command without spawning it.
 * @param flags - assembly flags appended after the fixed target and dry-run flags.
 * @returns The finished subprocess.
 */
function dryRun(...flags: string[]) {
  return spawnSync(process.execPath, [
    '--import',
    'tsx/esm',
    script,
    '--dry-run',
    // Assembly reads the upstream products, which a spec run never builds.
    '--entry-only',
    ...flags,
  ], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, npm_execpath: 'C:\\tools\\pnpm.cjs' },
  })
}

describe('npm executable assembler compression flags', () => {
  it('forwards the fast Brotli default without a quality override', () => {
    const result = dryRun()

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('--compress=Brotli')
    expect(result.stdout).not.toContain('--compress-quality')
  })

  it('forwards an explicit Brotli quality to the executable build', () => {
    const result = dryRun('--compress-quality=11')

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('--compress=Brotli --compress-quality=11')
  })

  it('forwards every compression flag, leaving validation to the executable build', () => {
    const result = dryRun('--compress=Zstd', '--compress-quality=7')

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('--compress=Zstd --compress-quality=7')
  })
})
