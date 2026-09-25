/** Locate packaged Office engines and keep their Windows resource paths inside the path limit. */

import { execFileSync } from 'node:child_process'
import { registerHooks, type ModuleHooks } from 'node:module'
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * Longest Windows engine directory whose LibreOffice `file:///` resource URLs stay inside the
 * 260-character limit. The deepest installed resource adds 88 characters below that directory and
 * the URL prefix adds 8, so 164 is the hard ceiling; the alias is published below 160.
 */
const WINDOWS_ENGINE_DIRECTORY_LIMIT = 160

/** Short Windows directory published to hold the Office alias. */
const WINDOWS_ALIAS_DIRECTORY = 'dsh-libreoffice-kit'

/** Node entry the alias publishes for the LibreOffice CLI. */
const WINDOWS_ALIAS_ENTRY = 'libreoffice-cli.mjs'

/**
 * Source of the published entry, which starts the CLI under the short alias. Node resolves an
 * imported package to its physical path, so without these flags a child process leaves the alias
 * and rebuilds the over-long paths LibreOffice cannot open.
 */
const WINDOWS_ALIAS_ENTRY_SOURCE = `import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('./node_modules/@deepseek-ai/libreoffice-kit/lib/cli.js', import.meta.url))
const child = spawn(process.execPath, ['--preserve-symlinks', '--preserve-symlinks-main', cli, ...process.argv.slice(2)], { stdio: 'inherit' })
child.on('exit', (code, signal) => {
  if (signal !== null) process.kill(process.pid, signal)
  else process.exitCode = code ?? 1
})
`

/** Alias published for one unpacked runtime directory. */
interface WindowsOfficeAlias {
  /** Junction standing in for the unpacked runtime `node_modules`. */
  readonly nodeModules: string
  /** Node entry that starts the CLI through `nodeModules`. */
  readonly cliEntry: string
}

/** Aliases published in this process, keyed by the unpacked runtime directory. */
const windowsAliases = new Map<string, WindowsOfficeAlias | undefined>()

/**
 * Locate the archive containing a packaged runtime.
 * @param runtimeDir - Prepared or ASAR-contained runtime directory.
 * @returns Parent archive path, or undefined for a prepared directory.
 */
export function runtimeArchivePath(runtimeDir: string): string | undefined {
  const parent = dirname(runtimeDir)
  return basename(parent) === 'app.asar' ? parent : undefined
}

/**
 * Locate the unpacked copy of an ASAR-contained runtime directory.
 * @param runtimeDir - Prepared or ASAR-contained runtime directory.
 * @returns Unpacked sibling directory, or undefined for a prepared directory.
 */
function unpackedRuntimeDirectory(runtimeDir: string): string | undefined {
  const archive = runtimeArchivePath(runtimeDir)
  if (archive === undefined) return undefined
  return join(`${archive}.unpacked`, relative(archive, realpathSync(runtimeDir)))
}

/**
 * Resolve the published alias for one unpacked runtime, creating it once per process.
 * @param unpackedDsh - Unpacked `dsh` directory beside the application archive.
 * @param runtimeDir - Containing runtime directory, named in the failure when no short path exists.
 * @returns Published alias, or undefined when the platform or the installed path needs none.
 */
function publishedWindowsOfficeAlias(unpackedDsh: string, runtimeDir: string): WindowsOfficeAlias | undefined {
  if (!windowsAliases.has(unpackedDsh)) windowsAliases.set(unpackedDsh, publishWindowsOfficeAlias(unpackedDsh, runtimeDir))
  return windowsAliases.get(unpackedDsh)
}

/**
 * Resolve the LibreOffice CLI entry a child process can run for a packaged runtime.
 *
 * The unpacked Windows engine directory is deeper than LibreOffice's `file:///` resource URLs
 * allow, so it is reached through a short alias instead; a child process has no module hooks and
 * would otherwise rebuild the over-long physical paths.
 * @param runtimeDir - Prepared or ASAR-contained dsh runtime directory.
 * @returns Alias CLI entry, or undefined when the caller should use the installed CLI directly.
 */
export function windowsOfficeAlias(runtimeDir: string): string | undefined {
  const unpacked = unpackedRuntimeDirectory(runtimeDir)
  if (unpacked === undefined) return undefined
  return publishedWindowsOfficeAlias(unpacked, runtimeDir)?.cliEntry
}

/**
 * Junction the unpacked runtime `node_modules` under a short directory and publish the CLI entry.
 * @param unpackedDsh - Unpacked `dsh` directory beside the application archive.
 * @param runtimeDir - Containing runtime directory, named in the failure when no short path exists.
 * @returns Published alias, or undefined when the platform or the installed path needs none.
 */
function publishWindowsOfficeAlias(unpackedDsh: string, runtimeDir: string): WindowsOfficeAlias | undefined {
  if (process.platform !== 'win32') return undefined
  const engine = `libreoffice-kit-${process.platform}-${process.arch}`
  const nodeModules = join(unpackedDsh, 'node_modules')
  if (join(nodeModules, '@deepseek-ai', engine).length <= WINDOWS_ENGINE_DIRECTORY_LIMIT) return undefined
  const root = join(process.env.LOCALAPPDATA ?? process.env.TEMP ?? dirname(unpackedDsh), WINDOWS_ALIAS_DIRECTORY)
  const alias = join(root, 'node_modules')
  if (join(alias, '@deepseek-ai', engine).length > WINDOWS_ENGINE_DIRECTORY_LIMIT) {
    throw new Error(`desktop Office: no short Windows path is available for the LibreOffice engine: ${runtimeDir}`)
  }
  // An earlier release published the engine directory itself at `root`; rmdir removes a link only.
  for (const existing of [alias, root]) {
    try {
      execFileSync('cmd.exe', ['/d', '/c', 'rmdir', existing], { stdio: 'ignore', windowsHide: true })
    } catch {
      // The alias is absent on the first launch and after an upgrade that removed it.
    }
  }
  mkdirSync(root, { recursive: true })
  execFileSync('cmd.exe', ['/d', '/c', 'mklink', '/J', alias, nodeModules], { stdio: 'ignore', windowsHide: true })
  const cliEntry = join(root, WINDOWS_ALIAS_ENTRY)
  writeFileSync(cliEntry, WINDOWS_ALIAS_ENTRY_SOURCE)
  return { nodeModules: alias, cliEntry }
}

/**
 * Keep engine executable and resource paths usable by native child processes outside Electron.
 *
 * Hooks apply only to this thread; a child process reaches the same short paths through the alias
 * entry published by {@link windowsOfficeAlias}.
 * @param runtimeDir - Prepared or ASAR-contained dsh runtime directory.
 * @returns Installed resolver for the Host lifetime, or undefined for a non-ASAR runtime.
 */
export function installOfficeEngineResolution(runtimeDir: string): ModuleHooks | undefined {
  const unpacked = unpackedRuntimeDirectory(runtimeDir)
  if (unpacked === undefined) return undefined
  const root = realpathSync(runtimeDir)
  const archive = dirname(root)
  const alias = publishedWindowsOfficeAlias(unpacked, runtimeDir)
  const source = pathToFileURL(join(root, 'node_modules', '@deepseek-ai', 'libreoffice-kit-')).href
  const destination = pathToFileURL(join(unpacked, 'node_modules', '@deepseek-ai', 'libreoffice-kit-')).href
  return registerHooks({
    resolve(specifier, context, nextResolve) {
      const resolved = nextResolve(specifier, context)
      if (!/^@deepseek-ai\/libreoffice-kit-(?:darwin|win32|linux)-/u.test(specifier)) return resolved
      const canonical = pathToFileURL(realpathSync(fileURLToPath(resolved.url))).href
      if (!canonical.startsWith(source)) {
        if (canonical.startsWith(pathToFileURL(archive + '/').href)) {
          throw new Error(`desktop Office engine resolved outside the runtime package directory: ${resolved.url}`)
        }
        return resolved
      }
      const physical = realpathSync(fileURLToPath(destination + canonical.slice(source.length)))
      const manifest = basename(physical) === 'package.json'
      const engineDir = manifest ? dirname(physical) : physical
      const target = alias === undefined ? engineDir : join(alias.nodeModules, '@deepseek-ai', basename(engineDir))
      return { ...resolved, url: pathToFileURL(manifest ? join(target, 'package.json') : target).href }
    },
  })
}
