/**
 * Resolution options for filesystem calls in the Session's current directory.
 * Non-agent calls leave directory defaults to the filesystem provider.
 * @module @deepseek-ai/dsh-tool-fs/session-cwd
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-working-directory'

/** Resolution options passed to `ctx.fs.resolve` and path-shaped `ctx.fs.lstat` probes. */
export interface ScopedResolveOptions {
  /** Directory a relative spelling resolves against; omitted leaves the provider default. */
  cwd?: string
  /** Cancels the resolution round-trip. */
  signal?: AbortSignal
}

/**
 * Resolve the current directory and cancellation for a filesystem call.
 * @param ctx - context containing the working-directory service.
 * @param exec - tool execution supplying the agent and cancellation.
 * @returns filesystem resolution options for this call.
 */
export async function sessionResolveOptions(
  ctx: Context,
  exec: ToolExecution,
): Promise<ScopedResolveOptions> {
  const cwd = exec.agent === undefined
    ? undefined
    : await ctx.workingDirectory.ensure(exec.agent, exec.signal)
  return { ...cwd !== undefined ? { cwd } : {}, signal: exec.signal }
}
