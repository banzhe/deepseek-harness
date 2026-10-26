/**
 * Pure types of the LLM network-stats domain: the `plugin:` record one request
 * reports, the `llmNetworkStats` projection key, and the figures a client
 * reads. Host-side value imports stay out of this file so the client namespace
 * can project it without reaching the session store, the projection registry,
 * or zod.
 *
 * @module @deepseek-ai/dsh-llm-network-stats/types
 */

import type { SessionProjectionSummaryExcluded } from '@deepseek-ai/dsh-session-projection/types'

// Marks this file a module so the declarations below AUGMENT the plugin record
// and projection tables instead of declaring ambient modules.
export {}

/**
 * What one LLM request reported about its own transport. Every figure is
 * measured on the request that ran, never derived from an earlier one.
 */
export interface NetworkRequestRecord {
  /**
   * Milliseconds from dispatch until the HTTP client had taken the complete
   * request body. Connection setup is inside this span, so a cold connection
   * reports it too.
   */
  uploadMs: number
  /** Milliseconds from that handover until the response headers arrived. */
  responseMs: number
  /** Serialized JSON request body size, in bytes. */
  requestBytes: number
  /** Bytes written to the wire: the compressed body when the route compresses. */
  sentBytes: number
  /** The `content-encoding` the body carried; absent for a plain body. */
  encoding?: 'gzip' | 'zstd' | undefined
  /** Auxiliary call classification; absent for a conversation request. */
  purpose?: 'compaction' | 'session-title' | undefined
  /** Registered provider route that served the request. */
  provider: string
  /** Provider-owned model id that served the request. */
  model: string
}

/** One request's own transport figures, as a client displays them. */
export interface NetworkRequestFigures {
  /** Milliseconds spent handing the request body to the HTTP client. */
  uploadMs: number
  /** Milliseconds spent waiting for the response headers afterwards. */
  responseMs: number
  /** Serialized JSON request body size, in bytes. */
  requestBytes: number
  /** Bytes written to the wire. */
  sentBytes: number
  /** The `content-encoding` the body carried; absent for a plain body. */
  encoding?: 'gzip' | 'zstd' | undefined
}

/**
 * Whole-log transport figures for one Session, independent of how much history
 * a client has paged in. Averages are the summed field over `requests`, which
 * is why the sums are published rather than pre-divided values: a client shows
 * one request's figures and the Session's average from the same value.
 *
 * Only conversation requests count. An auxiliary call — compaction, session
 * title — still lands in the log, so the figures can be re-derived, but it is
 * excluded from both the average and `last`.
 */
export interface NetworkStatsProjection {
  /** Conversation requests that reported transport figures. */
  requests: number
  /** Summed upload time over `requests`, in milliseconds. */
  uploadMs: number
  /** Summed response-header wait over `requests`, in milliseconds. */
  responseMs: number
  /** Summed request body size over `requests`, in bytes. */
  requestBytes: number
  /** Summed bytes written to the wire over `requests`. */
  sentBytes: number
  /** Counted requests whose body carried a `content-encoding`. */
  compressedRequests: number
  /** The last counted request's own figures, or null before the first. */
  last: NetworkRequestFigures | null
}

declare module '@deepseek-ai/dsh-session/types' {
  interface PluginRecordMap {
    /**
     * Transport figures one LLM request reported once its response headers
     * arrived, written by `@deepseek-ai/dsh-llm-network-stats`.
     * Absent for a route whose protocol refuses an injected fetch, and for a
     * request outside any Session.
     */
    'plugin:llm-network-stats/request': NetworkRequestRecord
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /**
     * Whole-log transport figures; see {@link NetworkStatsProjection}.
     * Excluded from Session summary payloads: no list row renders these
     * figures.
     */
    llmNetworkStats: SessionProjectionSummaryExcluded<NetworkStatsProjection>
  }
}
