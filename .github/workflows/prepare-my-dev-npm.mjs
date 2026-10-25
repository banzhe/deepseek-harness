/** Resolve the my_dev release version the npm single-executable packages reuse. */
import { appendFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { desktopBuildVersionPrefix, validateDesktopBuildVersion } from '../../apps/desktop/scripts/desktop-build-version.mjs'

/**
 * Build the version shared by the GitHub Release tag and the `@banzhe/dsh-banzhe` packages.
 * @param {NodeJS.ProcessEnv} environment Action inputs and GitHub run identity.
 * @param {string} productVersion Version declared by the desktop package.
 * @param {Date} now Time used for the UTC date segment.
 * @returns {string} Validated version.
 */
export function myDevNpmVersion(environment, productVersion, now = new Date()) {
  for (const name of ['GITHUB_RUN_NUMBER', 'GITHUB_RUN_ATTEMPT']) {
    if (!/^[1-9]\d*$/u.test(environment[name] ?? '')) throw new Error(`${name} must be a positive integer`)
  }
  const date = now.toISOString().slice(0, 10).replaceAll('-', '')
  return validateDesktopBuildVersion(
    `${desktopBuildVersionPrefix(productVersion)}${date}.${environment.GITHUB_RUN_NUMBER}.${environment.GITHUB_RUN_ATTEMPT}`,
    productVersion,
  )
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  const repositoryRoot = resolve(import.meta.dirname, '..', '..')
  const product = JSON.parse(readFileSync(resolve(repositoryRoot, 'apps/desktop/package.json'), 'utf8'))
  const version = myDevNpmVersion(process.env, product.version)
  if (!process.env.GITHUB_OUTPUT) throw new Error('Run this adapter from GitHub Actions')
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`)
}
