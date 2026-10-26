/**
 * The `llmNetworkStats` projection unit: a pure fold of the transport facts each
 * LLM request reports into whole-log upload time, response-header wait, and
 * request-body compression figures.
 *
 * The unit reads `plugin:` records rather than conversation events, because the
 * figures describe the request's transport and not the model's output: they are
 * absent for a route whose protocol refuses an injected fetch, and a record
 * whose payload a future build reshaped is dropped instead of misread.
 *
 * Only conversation requests count. An auxiliary call — compaction, session
 * title — is a real request with a real upload, but folding it in would let one
 * compaction dominate the "last request" reading the figures exist to show.
 *
 * @module @deepseek-ai/dsh-llm-network-stats/projection
 */

import { z } from 'zod'
import { pluginRecordOf } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { NetworkRequestFigures, NetworkStatsProjection } from './types.ts'

/** The plugin record this unit folds; its owner writes it through `appendPluginRecord`. */
export const NETWORK_REQUEST_RECORD = 'plugin:llm-network-stats/request'

/**
 * One request's own figures. The record schema extends this one: the fold
 * publishes these fields and validates the payload that carries them, so a
 * change to either has one home.
 */
const networkRequestFiguresSchema = z.object({
  uploadMs: z.number().nonnegative(),
  responseMs: z.number().nonnegative(),
  requestBytes: z.number().int().nonnegative(),
  sentBytes: z.number().int().nonnegative(),
  encoding: z.union([z.literal('gzip'), z.literal('zstd')]).optional(),
}).strict()

/**
 * One request's record, validated at the read boundary: a restored record
 * carries whatever JSON an earlier build of this plugin wrote.
 */
const networkRequestRecordSchema = networkRequestFiguresSchema.extend({
  purpose: z.union([z.literal('compaction'), z.literal('session-title')]).optional(),
  provider: z.string(),
  model: z.string(),
}).strict()

/**
 * The figures' shape. The fold state carries no boundary field beyond the
 * totals and `last`, so one schema serves the persisted-cache precondition and
 * the wire output boundary.
 */
const networkStatsSchema = z.object({
  requests: z.number().int().nonnegative(),
  uploadMs: z.number().nonnegative(),
  responseMs: z.number().nonnegative(),
  requestBytes: z.number().int().nonnegative(),
  sentBytes: z.number().int().nonnegative(),
  compressedRequests: z.number().int().nonnegative(),
  last: networkRequestFiguresSchema.nullable(),
}).strict()

/** The `llmNetworkStats` unit registered on `ctx.sessionProjections` (exported for the unit spec). */
export const networkStatsProjectionDefinition = {
  key: 'llmNetworkStats',
  stateVersion: 1,
  stateSchema: networkStatsSchema,
  init: (): NetworkStatsProjection => ({
    requests: 0,
    uploadMs: 0,
    responseMs: 0,
    requestBytes: 0,
    sentBytes: 0,
    compressedRequests: 0,
    last: null,
  }),
  apply: (state, event) => {
    const record = pluginRecordOf(event)
    if (record === undefined || record.type !== NETWORK_REQUEST_RECORD) return state
    const parsed = networkRequestRecordSchema.safeParse(record.data)
    if (!parsed.success) return state
    const data = parsed.data
    // An auxiliary call is recorded but never counted: see the module JSDoc.
    if (data.purpose !== undefined) return state
    const last: NetworkRequestFigures = {
      uploadMs: data.uploadMs,
      responseMs: data.responseMs,
      requestBytes: data.requestBytes,
      sentBytes: data.sentBytes,
      ...data.encoding === undefined ? {} : { encoding: data.encoding },
    }
    return {
      requests: state.requests + 1,
      uploadMs: state.uploadMs + data.uploadMs,
      responseMs: state.responseMs + data.responseMs,
      requestBytes: state.requestBytes + data.requestBytes,
      sentBytes: state.sentBytes + data.sentBytes,
      compressedRequests: state.compressedRequests + (data.encoding === undefined ? 0 : 1),
      last,
    }
  },
  wire: {
    viewSchema: networkStatsSchema,
    view: state => ({
      requests: state.requests,
      uploadMs: state.uploadMs,
      responseMs: state.responseMs,
      requestBytes: state.requestBytes,
      sentBytes: state.sentBytes,
      compressedRequests: state.compressedRequests,
      last: state.last,
    }),
    summary: false,
  },
} satisfies ProjectionDefinition<'llmNetworkStats', NetworkStatsProjection>
