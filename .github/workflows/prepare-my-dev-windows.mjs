/** Write public unsigned Windows settings and a my_dev build version for GitHub Actions. */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { load } from 'js-yaml'
import { resolve } from 'node:path'
import { desktopBuildVersionPrefix, validateDesktopBuildVersion } from '../../apps/desktop/scripts/desktop-build-version.mjs'
import { resolveDesktopPolicyEnvironment } from '../../apps/desktop/scripts/desktop-policy-environment.mjs'

/**
 * Build the dotenv and version a personal unsigned Windows package needs.
 * @param {NodeJS.ProcessEnv} environment Action inputs and GitHub run identity.
 * @param {string} productVersion Version declared by the desktop package.
 * @param {Date} now Time used for the UTC date segment.
 * @returns {{ version: string, settings: string }} Validated version and public dotenv content.
 */
export function myDevWindowsSettings(environment, productVersion, now = new Date()) {
  for (const name of ['GITHUB_RUN_NUMBER', 'GITHUB_RUN_ATTEMPT']) {
    if (!/^[1-9]\d*$/u.test(environment[name] ?? '')) throw new Error(`${name} must be a positive integer`)
  }
  const origin = environment.PACKAGE_POLICY_ORIGIN?.trim()
  if (!origin) throw new Error('policy_origin is required')
  const loginOrigins = (environment.PACKAGE_LOGIN_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean)
  const policy = resolveDesktopPolicyEnvironment({
    DSH_DESKTOP_AUTO_UPDATE_ENV: 'test',
    DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: origin,
    DSH_DESKTOP_MANDATORY_UPDATE_CONFIG: JSON.stringify({
      allowedAuthOrigins: loginOrigins.length > 0 ? loginOrigins : [origin],
    }),
  })
  const date = now.toISOString().slice(0, 10).replaceAll('-', '')
  const version = validateDesktopBuildVersion(
    `${desktopBuildVersionPrefix(productVersion)}${date}.${environment.GITHUB_RUN_NUMBER}.${environment.GITHUB_RUN_ATTEMPT}`,
    productVersion,
  )
  const settings = [
    'DSH_DESKTOP_APP_ID=com.deepseek.harness',
    'DSH_DESKTOP_AUTO_UPDATE_ENV=test',
    `DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN=${policy.origin}`,
    `DSH_DESKTOP_MANDATORY_UPDATE_CONFIG=${JSON.stringify({ allowedAuthOrigins: policy.allowedAuthOrigins })}`,
  ].join('\n') + '\n'
  return { version, settings }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  const repositoryRoot = resolve(import.meta.dirname, '..', '..')
  const product = JSON.parse(readFileSync(resolve(repositoryRoot, 'apps/desktop/package.json'), 'utf8'))
  const result = myDevWindowsSettings(process.env, product.version)
  if (!process.env.GITHUB_OUTPUT) throw new Error('Run this adapter from GitHub Actions')
  writeFileSync(resolve(repositoryRoot, 'apps/desktop/.env.windows'), result.settings, { flag: 'wx' })
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${result.version}\n`)
}

/**
 * Point one unsigned Windows feed at the latest GitHub Release assets.
 * @param {string} metadata electron-builder nightly metadata.
 * @param {string} repository Repository in owner/name form.
 * @returns {string} Metadata whose installer URL is public and stable.
 */
export function githubReleaseMetadata(metadata, repository) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)) {
    throw new Error('GITHUB_REPOSITORY must be owner/name')
  }
  const parsed = load(metadata)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('nightly.yml must be an object')
  const files = parsed.files
  if (!Array.isArray(files) || files.length !== 1 || typeof files[0] !== 'object' || files[0] === null) {
    throw new Error('nightly.yml must contain exactly one file')
  }
  const filename = files[0].url
  if (typeof filename !== 'string' || !/^[^/\\]+\.exe$/u.test(filename)) throw new Error('nightly.yml file must be one installer name')
  const url = `https://github.com/${repository}/releases/latest/download/${filename}`
  return metadata
    .replace(`url: ${filename}`, `url: ${url}`)
    .replace(`path: ${filename}`, `path: ${url}`)
}
