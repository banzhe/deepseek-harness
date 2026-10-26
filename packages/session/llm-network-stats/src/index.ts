/**
 * Records the transport facts of every LLM request into its Session, and serves
 * their whole-log aggregates through the session-projection seam.
 *
 * The plugin owns both halves of one number: the durable record a request
 * writes (`plugin:llm-network-stats/request`, an ignorable plugin record that
 * adds no released persistence schema) and the `llmNetworkStats` unit folding
 * it. Delivery is the projection seam's.
 *
 * Writing is best-effort by design: these figures are diagnostics about a
 * request that already succeeded, so a record that cannot be written is
 * reported and dropped rather than failing the request that produced it.
 *
 * @module @deepseek-ai/dsh-llm-network-stats
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-llm-pi-ai'
import type { RequestTransportFacts } from '@deepseek-ai/dsh-llm-pi-ai'
import { appendPluginRecord } from '@deepseek-ai/dsh-session'
import { NETWORK_REQUEST_RECORD, networkStatsProjectionDefinition } from './projection.ts'

export type * from './types.ts'
export { NETWORK_REQUEST_RECORD } from './projection.ts'

/** Cordis plugin name. */
export const name = 'llm-network-stats'
/** The Session store owns the log the record lands in; the registry serves the fold. */
export const inject = ['sessions', 'sessionProjections']

/**
 * Append one request's transport facts to its Session log.
 *
 * A request outside any Session, or one whose Session is no longer live, has no
 * log to record into and is skipped: an auxiliary caller such as a title request
 * still reports facts, and it must not resurrect a Session to hold them.
 * @param ctx - plugin context carrying the Session store.
 * @param facts - transport facts of the request that just answered.
 */
function record(ctx: Context, facts: RequestTransportFacts): void {
  const sessionId = facts.sessionId
  if (sessionId === undefined) return
  const session = ctx.sessions.get(sessionId)
  if (session === undefined) return
  try {
    appendPluginRecord(session, NETWORK_REQUEST_RECORD, {
      uploadMs: facts.uploadMs,
      responseMs: facts.responseMs,
      requestBytes: facts.requestBytes,
      sentBytes: facts.sentBytes,
      ...facts.encoding === undefined ? {} : { encoding: facts.encoding },
      ...facts.purpose === undefined ? {} : { purpose: facts.purpose },
      provider: facts.provider,
      model: facts.model,
    })
  } catch (error: unknown) {
    // The request this describes has already answered; its diagnostics must not
    // become its failure.
    ctx.logger.warn('llm-network-stats: could not record request transport facts')
    ctx.logger.warn(error)
  }
}

/**
 * Register the `llmNetworkStats` unit and listen for the transport facts an LLM
 * adapter emits. Both are effects on this plugin's fiber, so unloading removes
 * the key and stops the recording.
 * @param ctx - registrant context carrying the Session store and projection registry.
 * @returns when the plugin is ready.
 */
export async function apply(ctx: Context): Promise<void> {
  await ctx.sessionProjections.register(networkStatsProjectionDefinition)
  ctx.on('llm/transport', (facts) => { record(ctx, facts) })
}
