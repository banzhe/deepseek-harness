/**
 * The optional `basePath` scope of one tool instance: every model-supplied path is
 * resolved through this module, so reads and mutations share one containment
 * decision and an out-of-range path fails before any provider read or mutation.
 * @module @deepseek-ai/dsh-tool-fs/base-path
 */

import type { Context } from '@deepseek-ai/cordis'
import { FsError } from '@deepseek-ai/dsh-fs'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { sessionResolveOptions } from './session-cwd.ts'
import type { ScopedResolveOptions } from './session-cwd.ts'

export type { ScopedResolveOptions }

/** One resolved target plus the options that produced it. */
export interface ScopedTarget {
  /** The admitted target. */
  target: FsTarget
  /** Resolution options naming the directory the spelling was read against. */
  options: ScopedResolveOptions
}

/**
 * Whether a spelling is rooted on its own (POSIX, Windows drive or UNC, or the
 * home shorthand), so it can never be read as relative to `basePath`.
 * @param path - the raw model-supplied path.
 * @returns true for a rooted spelling.
 */
function isRooted(path: string): boolean {
  return path.startsWith('/')
    || path.startsWith('\\')
    || /^[A-Za-z]:/u.test(path)
    || path === '~'
    || path.startsWith('~/')
    || path.startsWith('~\\')
}

/**
 * Whether a spelling climbs above the directory it starts in. Such a spelling
 * keeps its meaning relative to the calling directory; re-reading it against
 * `basePath` could fold it back inside the scope, so it never gets that second
 * reading.
 * @param path - the raw model-supplied path.
 * @returns true when a `..` segment would leave the starting directory.
 */
function climbsAboveStart(path: string): boolean {
  let depth = 0
  for (const segment of path.split(/[\\/]/u)) {
    if (segment === '' || segment === '.') continue
    if (segment !== '..') depth += 1
    else if (depth === 0) return true
    else depth -= 1
  }
  return false
}

/**
 * Path admission for one `tool-fs` instance. Without a configured `basePath`
 * every path resolves exactly as the provider would. With one, a path is
 * accepted in either spelling: relative to the Session's current directory, or
 * — when the first reading lands outside the scope and the spelling does not
 * climb with `..` — relative to the configured directory.
 */
export class PathScope {
  /** The configured directory as written, or undefined when paths are unrestricted. */
  private readonly basePath: string | undefined

  /**
   * Bind one instance to its configuration.
   * @param ctx - context owning the `fs` service used for resolution.
   * @param basePath - the configured `basePath`; unset or blank leaves paths unrestricted.
   */
  constructor(private readonly ctx: Context, basePath: string | undefined) {
    const trimmed = basePath?.trim() ?? ''
    this.basePath = trimmed.length === 0 ? undefined : trimmed
  }

  /**
   * Resolve one model-supplied path and refuse anything outside a configured `basePath`.
   * @param rawPath - the path exactly as the tool argument or patch operation spells it.
   * @param exec - the tool execution supplying the Session directory and cancellation.
   * @returns the admitted target and the options that produced it.
   * @throws FsError `FS_PERMISSION_DENIED` when the target lies outside the configured `basePath`.
   */
  async resolve(rawPath: string, exec: ToolExecution): Promise<ScopedTarget> {
    const options = await sessionResolveOptions(this.ctx, exec)
    const basePath = this.basePath
    if (basePath === undefined) return { target: await this.ctx.fs.resolve(rawPath, options), options }
    const root = await this.ctx.fs.resolve(basePath, options)
    const direct = await this.ctx.fs.resolve(rawPath, options)
    if (this.ctx.fs.contains(root, direct)) return { target: direct, options }
    if (isRooted(rawPath) || climbsAboveStart(rawPath)) throw refusedPath(rawPath, basePath)
    const rooted = { ...options, cwd: this.ctx.fs.processPath(root) }
    const relative = await this.ctx.fs.resolve(rawPath, rooted)
    if (!this.ctx.fs.contains(root, relative)) throw refusedPath(rawPath, basePath)
    return { target: relative, options: rooted }
  }
}

/**
 * Build the refusal for one path outside the configured scope.
 * @param rawPath - the path as the caller spelled it.
 * @param basePath - the configured directory, echoed for the model.
 * @returns the error to throw from the caller's resolution step.
 */
function refusedPath(rawPath: string, basePath: string): FsError {
  return new FsError(`Path "${rawPath}" is outside the configured basePath "${basePath}".`, 'FS_PERMISSION_DENIED')
}
