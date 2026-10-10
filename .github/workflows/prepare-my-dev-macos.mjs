/** Resolve the my_dev build version for an unsigned macOS arm64 GitHub Actions package. */
import { appendFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { desktopBuildVersionPrefix, validateDesktopBuildVersion } from '../../apps/desktop/scripts/desktop-build-version.mjs'

/**
 * Unsigned macOS packaging reads no dotenv file, so the only setting this run needs is a version.
 * @param {NodeJS.ProcessEnv} environment Action environment with the GitHub run identity.
 * @param {string} productVersion Version declared by the desktop package.
 * @param {Date} now Time used for the UTC date segment.
 * @returns {{ version: string }} Validated build version.
 */
export function myDevMacOSSettings(environment, productVersion, now = new Date()) {
  for (const name of ['GITHUB_RUN_NUMBER', 'GITHUB_RUN_ATTEMPT']) {
    if (!/^[1-9]\d*$/u.test(environment[name] ?? '')) throw new Error(`${name} must be a positive integer`)
  }
  const date = now.toISOString().slice(0, 10).replaceAll('-', '')
  const version = validateDesktopBuildVersion(
    `${desktopBuildVersionPrefix(productVersion)}${date}.${environment.GITHUB_RUN_NUMBER}.${environment.GITHUB_RUN_ATTEMPT}`,
    productVersion,
  )
  return { version }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  const repositoryRoot = resolve(import.meta.dirname, '..', '..')
  const product = JSON.parse(readFileSync(resolve(repositoryRoot, 'apps/desktop/package.json'), 'utf8'))
  const result = myDevMacOSSettings(process.env, product.version)
  if (!process.env.GITHUB_OUTPUT) throw new Error('Run this adapter from GitHub Actions')
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${result.version}\n`)
}