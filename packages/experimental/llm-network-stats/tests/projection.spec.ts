/**
 * The `llmNetworkStats` unit and the writer beside it: one request's transport
 * facts land in the Session log as an ignorable plugin record, the unit folds
 * them into whole-log figures, and unmounting the plugin removes the key. The
 * record path is exercised through the adapter's own event, so the contract
 * between the two packages is covered rather than assumed.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { RequestTransportFacts } from '@deepseek-ai/dsh-llm-pi-ai'
import { appendPluginRecord, pluginRecordOf, SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import * as LlmNetworkStats from '@deepseek-ai/dsh-experimental-llm-network-stats'
import {
  NETWORK_REQUEST_RECORD,
  networkStatsProjectionDefinition,
} from '@deepseek-ai/dsh-experimental-llm-network-stats/src/projection.ts'
import type { NetworkStatsProjection } from '@deepseek-ai/dsh-experimental-llm-network-stats/types'

declare module '@deepseek-ai/dsh-session/types' {
  interface PluginRecordMap {
    /** A record type this unit does not fold, declared here to prove the fold ignores it. */
    'plugin:test/other': { uploadMs: number }
  }
}

/** The records one Session committed, whatever their type. */
function records(session: Session): number {
  return session.snapshotEvents().filter(event => pluginRecordOf(event)?.type === NETWORK_REQUEST_RECORD).length
}

async function harness(withPlugin = true): Promise<{ ctx: Context; session: Session }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  if (withPlugin) await ctx.plugin(LlmNetworkStats)
  return { ctx, session: ctx.sessions.create(SessionId('measured')) }
}

/** One request's facts, with the Session and route every case here shares. */
function facts(overrides: Partial<RequestTransportFacts> = {}): RequestTransportFacts {
  return {
    uploadMs: 120,
    responseMs: 80,
    requestBytes: 4_000,
    sentBytes: 1_000,
    sessionId: SessionId('measured'),
    provider: 'magpie',
    model: 'ollama-cloud/beam',
    ...overrides,
  }
}

/** The all-zero projection value plus overrides, for exact fold expectations. */
function totals(overrides: Partial<NetworkStatsProjection> = {}): NetworkStatsProjection {
  return {
    requests: 0,
    uploadMs: 0,
    responseMs: 0,
    requestBytes: 0,
    sentBytes: 0,
    compressedRequests: 0,
    last: null,
    ...overrides,
  }
}

/** Fold committed events through the exported definition, for cases the drive cannot express. */
function fold(events: readonly SessionEvent[]): NetworkStatsProjection {
  const state = events.reduce(
    (folded, event) => networkStatsProjectionDefinition.apply(folded, event),
    networkStatsProjectionDefinition.init(),
  )
  return networkStatsProjectionDefinition.wire.view(state)
}

describe('llmNetworkStats projection unit (registry drive)', () => {
  it('serves zero figures on the empty log', async () => {
    const { ctx, session } = await harness()
    expect(ctx.sessionProjections.snapshot(session).values.llmNetworkStats).toEqual(totals())
  })

  it('records one request and serves it as both the last reading and the average', async () => {
    const { ctx, session } = await harness()
    ctx.emit('llm/transport', facts())

    expect(ctx.sessionProjections.snapshot(session).values.llmNetworkStats).toEqual(totals({
      requests: 1,
      uploadMs: 120,
      responseMs: 80,
      requestBytes: 4_000,
      sentBytes: 1_000,
      last: { uploadMs: 120, responseMs: 80, requestBytes: 4_000, sentBytes: 1_000 },
    }))
  })

  it('sums every request while the last reading stays the newest one', async () => {
    const { ctx, session } = await harness()
    ctx.emit('llm/transport', facts())
    ctx.emit('llm/transport', facts({ uploadMs: 200, responseMs: 40, requestBytes: 6_000, sentBytes: 2_000 }))

    expect(ctx.sessionProjections.snapshot(session).values.llmNetworkStats).toEqual(totals({
      requests: 2,
      uploadMs: 320,
      responseMs: 120,
      requestBytes: 10_000,
      sentBytes: 3_000,
      last: { uploadMs: 200, responseMs: 40, requestBytes: 6_000, sentBytes: 2_000 },
    }))
  })

  it('counts a compressed request and keeps its encoding on the last reading', async () => {
    const { ctx, session } = await harness()
    ctx.emit('llm/transport', facts({ encoding: 'zstd' }))

    expect(ctx.sessionProjections.snapshot(session).values.llmNetworkStats).toEqual(totals({
      requests: 1,
      uploadMs: 120,
      responseMs: 80,
      requestBytes: 4_000,
      sentBytes: 1_000,
      compressedRequests: 1,
      last: { uploadMs: 120, responseMs: 80, requestBytes: 4_000, sentBytes: 1_000, encoding: 'zstd' },
    }))
  })

  it('records an auxiliary call without counting it', async () => {
    const { ctx, session } = await harness()
    ctx.emit('llm/transport', facts())
    ctx.emit('llm/transport', facts({ purpose: 'compaction', uploadMs: 9_000, responseMs: 9_000 }))

    expect(ctx.sessionProjections.snapshot(session).values.llmNetworkStats).toEqual(totals({
      requests: 1,
      uploadMs: 120,
      responseMs: 80,
      requestBytes: 4_000,
      sentBytes: 1_000,
      last: { uploadMs: 120, responseMs: 80, requestBytes: 4_000, sentBytes: 1_000 },
    }))
    // Recorded, not dropped: the figures can be re-derived from the log.
    expect(records(session)).toBe(2)
  })

  it.each([
    ['a request outside any Session', { sessionId: undefined }],
    ['a request whose Session is not live', { sessionId: SessionId('absent') }],
  ])('records nothing for %s', async (_label, overrides) => {
    const { ctx, session } = await harness()
    ctx.emit('llm/transport', facts(overrides))

    expect(records(session)).toBe(0)
    expect(ctx.sessionProjections.snapshot(session).values.llmNetworkStats).toEqual(totals())
  })

  it('has no key without the plugin, and drops it when the plugin unloads (HMR safety)', async () => {
    const { ctx, session } = await harness(false)
    expect('llmNetworkStats' in ctx.sessionProjections.snapshot(session).values).toBe(false)

    const fiber = await ctx.plugin(LlmNetworkStats)
    expect(ctx.sessionProjections.snapshot(session).values.llmNetworkStats).toEqual(totals())

    await fiber.dispose()
    expect('llmNetworkStats' in ctx.sessionProjections.snapshot(session).values).toBe(false)
  })
})

describe('llmNetworkStats fold (direct definition)', () => {
  it('returns the same state for an event that is not its record', async () => {
    const { session } = await harness(false)
    session.append('step/start', { turn: 1, step: 1 })
    const state = networkStatsProjectionDefinition.init()

    expect(networkStatsProjectionDefinition.apply(state, session.snapshotEvents()[0] as SessionEvent)).toBe(state)
  })

  it('drops a record whose payload a different build wrote', async () => {
    const { session } = await harness(false)
    appendPluginRecord(session, NETWORK_REQUEST_RECORD, {
      uploadMs: -1,
      responseMs: 0,
      requestBytes: 0,
      sentBytes: 0,
      provider: 'magpie',
      model: 'ollama-cloud/beam',
    })

    expect(fold(session.snapshotEvents())).toEqual(totals())
  })

  it('drops an unrecognized record type', async () => {
    const { session } = await harness(false)
    appendPluginRecord(session, 'plugin:test/other', { uploadMs: 10 })

    expect(fold(session.snapshotEvents())).toEqual(totals())
  })
})
