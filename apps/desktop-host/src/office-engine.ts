/** Resolve packaged Office engine manifests from their complete, unpacked resource directories. */
import { execFileSync } from 'node:child_process'
import { registerHooks, type ModuleHooks } from 'node:module'
import { realpathSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * Longest unpacked engine root whose `file:///` resource URLs stay inside the
 * Windows 260-character path limit. Longer roots use a junction.
 */
const WINDOWS_ENGINE_LINK_BUDGET = 180

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
 * Point one unpacked engine package at a short junction when its own path is too long for LibreOffice.
 * @param engineDir - Physical unpacked engine package directory.
 * @returns The directory the helper can stat, or the original directory when it already fits.
 */
export function shortenWindowsOfficeEngine(engineDir: string): string {
  if (process.platform !== 'win32' || engineDir.length <= WINDOWS_ENGINE_LINK_BUDGET) return engineDir
  const link = join(process.env.LOCALAPPDATA ?? process.env.TEMP ?? dirname(engineDir), 'dsh-libreoffice-kit')
  try {
    execFileSync('cmd.exe', ['/d', '/c', 'rmdir', link], { stdio: 'ignore', windowsHide: true })
  } catch {
    // The junction is absent on the first launch.
  }
  execFileSync('cmd.exe', ['/d', '/c', 'mklink', '/J', link, engineDir], { stdio: 'ignore', windowsHide: true })
  // realpath expands the junction back past the Windows path limit, so the helper must keep this path.
  return link
}

/**
 * Keep engine executable and resource paths usable by native child processes outside Electron.
 * Hooks apply only to this thread; worker threads must install their own resolver.
 * @param runtimeDir - Prepared or ASAR-contained dsh runtime directory.
 * @returns Installed resolver for the Host lifetime, or undefined for a non-ASAR runtime.
 */
export function installOfficeEngineResolution(runtimeDir: string): ModuleHooks | undefined {
  if (runtimeArchivePath(runtimeDir) === undefined) return undefined
  const root = realpathSync(runtimeDir)
  const archive = dirname(root)
  const source = pathToFileURL(join(root, 'node_modules', '@deepseek-ai', 'libreoffice-kit-')).href
  const destination = pathToFileURL(join(`${archive}.unpacked`, relative(archive, root), 'node_modules', '@deepseek-ai', 'libreoffice-kit-')).href
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
      const engineDir = shortenWindowsOfficeEngine(manifest ? dirname(physical) : physical)
      return { ...resolved, url: pathToFileURL(manifest ? join(engineDir, 'package.json') : engineDir).href }
    },
  })
}
