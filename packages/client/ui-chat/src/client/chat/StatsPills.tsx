// Composer statistics pills, each its own 'conversation.composer.dock' list
// entry (activity, usage) so a plugin can replace or add one pill by id.
// Compact keeps speed and cache hit as plain readings; Detailed adds counts,
// token totals, and click-open dialogs. Settled-node identity prevents
// stream-delta updates from rerendering the pills.

import { memo, useMemo, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconDatabaseOutlineRegular, IconGaugeOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { UseProjection } from '@deepseek-ai/dsh-api-session-controller/client'
import type { InjectFace, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: merges the sessionStats key into SessionProjectionMap for useProjection.
import type {} from '@deepseek-ai/dsh-session-stats/client'
// Type-only: merges the llmNetworkStats key into SessionProjectionMap for useProjection.
import type {} from '@deepseek-ai/dsh-llm-network-stats/client'
import type { TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client'
import type { ChatViewSlotProps, PerformanceUsageInjected } from '../contract/slots.ts'
import type { ChatSnapshot } from '../contract/snapshot.ts'
import { formatTokensPerSecond } from './message-chrome.ts'
import { assistantStepReading } from '../contract/turn-metrics.ts'
import { formatCacheHitPercent, formatExactTokens, formatTokens } from './token-format.ts'
import { MEASURE_STYLE, useStatDialog } from './stat-dialog.ts'
import css from './StatsPills.module.css'
import dialogCss from './stat-dialog.module.css'

interface WindowStats {
  turns: number
  steps: number
  /** Summed request wall time (step/start → assistant/message); 0 when no node carries timing. */
  llmMs: number
  /** Summed tool wall time (tool/call → tool/result); 0 when no pair is in-window. */
  toolMs: number
  /** Summed first-token latency over `ttftSteps`; 0 when no step records it. */
  ttftMs: number
  /** Steps carrying a recorded TTFT. */
  ttftSteps: number
  /** Summed decode wall time over steps that also report output tokens. */
  decodeMs: number
  /** Summed output tokens over the same decode-timed steps. */
  decodeTokens: number
  /** Summed step wall time over steps that also report output tokens. */
  e2eMs: number
  /** Summed output tokens over the same steps as `e2eMs`. */
  e2eTokens: number
}

/**
 * Fold assistant and tool-result nodes into window-scoped display totals —
 * the FALLBACK for assemblies without the `sessionStats` projection.
 *
 * Every displayed figure rides that durable whole-log projection (and token
 * accounting rides `tokenUsage`) because the window is paged and compaction
 * rewrites it; this fold answers "what is on screen" only when no projection
 * value is served. Its field names deliberately mirror the projection's so
 * the two swap wholesale.
 * @param nodes - snapshot nodes.
 * @returns fallback counts and summed wall times.
 */
export function deriveStats(nodes: ChatSnapshot['legacy']['nodes']): WindowStats {
  const turns = new Set<number>()
  let steps = 0
  let llmMs = 0
  let toolMs = 0
  let ttftMs = 0
  let ttftSteps = 0
  let decodeMs = 0
  let decodeTokens = 0
  let e2eMs = 0
  let e2eTokens = 0
  for (const node of nodes) {
    if (node.kind === 'tool-result') {
      if (node.callTime !== null) toolMs += Math.max(0, node.time - node.callTime)
      continue
    }
    if (node.kind !== 'assistant') continue
    turns.add(node.turn)
    steps += 1
    if (node.timing !== undefined && node.timing.stepStartTime !== null) {
      llmMs += Math.max(0, node.timing.completedTime - node.timing.stepStartTime)
    }
    const reading = assistantStepReading(node)
    if (reading.ttftMs !== null) {
      ttftMs += reading.ttftMs
      ttftSteps += 1
    }
    if (reading.decodeMs !== null && reading.outputTokens !== null) {
      decodeMs += reading.decodeMs
      decodeTokens += reading.outputTokens
      if (reading.ttftMs !== null && node.timing !== undefined && node.timing.stepStartTime !== null) {
        e2eMs += Math.max(0, node.timing.completedTime - node.timing.stepStartTime)
        e2eTokens += reading.outputTokens
      }
    }
  }
  return { turns: turns.size, steps, llmMs, toolMs, ttftMs, ttftSteps, decodeMs, decodeTokens, e2eMs, e2eTokens }
}

/**
 * Compact duration: 45.2s under a minute, 2m42s from there on.
 * @param ms - duration in milliseconds.
 * @returns display string.
 */
export function formatDuration(ms: number, t: ChatViewSlotProps['t']): string {
  const s = ms / 1_000
  if (s < 60) return t('duration.compactSeconds', { seconds: Math.round(s * 10) / 10 })
  const whole = Math.round(s)
  return t('duration.compactMinutes', {
    minutes: Math.floor(whole / 60),
    seconds: whole % 60,
  })
}

/**
 * Byte size with a binary unit: 512 B / 12.4 KB / 2.1 MB / 1.2 GB.
 * @param bytes - non-negative byte count.
 * @param t - Chat locale seat.
 * @returns locale-owned size reading.
 */
export function formatBytes(bytes: number, t: ChatViewSlotProps['t']): string {
  const scaled = (value: number): string => String(Math.round(value * 10) / 10)
  if (bytes < 1_024) return t('stats.network.bytes', { value: String(bytes) })
  if (bytes < 1_048_576) return t('stats.network.kilobytes', { value: scaled(bytes / 1_024) })
  if (bytes < 1_073_741_824) return t('stats.network.megabytes', { value: scaled(bytes / 1_048_576) })
  return t('stats.network.gigabytes', { value: scaled(bytes / 1_073_741_824) })
}

/**
 * Sub-second spans read in milliseconds; longer ones use the compact duration form.
 * @param ms - non-negative duration in milliseconds.
 * @param t - Chat locale seat.
 * @returns locale-owned duration reading.
 */
export function formatLatency(ms: number, t: ChatViewSlotProps['t']): string {
  return ms < 1_000 ? t('duration.milliseconds', { milliseconds: Math.round(ms) }) : formatDuration(ms, t)
}

/**
 * Compression ratio as whole percent — the sent size over the original.
 * @param sentBytes - bytes written to the wire.
 * @param requestBytes - bytes before compression.
 * @returns whole-percent text, or '100' when there was no body to compress.
 */
export function compressionPercent(sentBytes: number, requestBytes: number): string {
  if (requestBytes <= 0) return '100'
  return String(Math.round(sentBytes / requestBytes * 100))
}

/**
 * Display-ready cache-hit share of prompt-side input over the whole durable log.
 * @param usage - the session's token-usage projection value.
 * @returns integer text when integer rounding stays below 100, otherwise the
 * minimum decimal precision that still rounds below 100; a full hit returns
 * 100, and no billed input returns null.
 */
export function cacheHitPercent(usage: TokenUsageProjection): string | null {
  const denominator = billedInputTokens(usage)
  return formatCacheHitPercent(usage.cacheReadTokens, denominator)
}

/**
 * Sum the three disjoint prompt-side billing buckets.
 * @param usage - the session's token-usage projection value.
 * @returns billed input tokens.
 */
export function billedInputTokens(usage: TokenUsageProjection): number {
  return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

type Translate = ChatViewSlotProps['t']

/** Props shared by every composer stats pill: the conversation-snapshot selector plus the projection read seat. */
export interface StatPillProps extends InjectFace<PerformanceUsageInjected> {
  useChat: SnapshotSelectorHook<ChatSnapshot>
  useProjection: UseProjection
  /** The owning dock's locale seat. */
  t: Translate
}

/** Dock entry id carried as `data-composer-stat` on each pill. */
type StatId = 'activity' | 'usage'

interface PillContent {
  stat: StatId
  icon: ReactNode
  label: ReactNode
  /** The full reading as plain text: the accessible name and the tooltip shown while the label is cut off. */
  text: string
}

function exactCount(value: number, t: Translate): string {
  return t('message.turnUsage.count', { count: formatExactTokens(value, t) })
}

/** One or two reading segments, visually joined by a separator glyph. */
function reading(first: string, second: string | null): Pick<PillContent, 'label' | 'text'> {
  if (second === null) return { label: first, text: first }
  return {
    label: (
      <>
        {first}
        <span className={css.sep} aria-hidden>·</span>
        {second}
      </>
    ),
    text: `${first} · ${second}`,
  }
}

/** One metric's last-request and whole-session readings, in one row. */
function lastAverage(last: string, average: string, t: Translate): string {
  return t('stats.network.lastAverage', { last, average })
}

// Every figure rides the durable sessionStats projection, so paging and
// compaction cannot change any of them; an assembly without the unit falls
// back to the window-scoped fold wholesale (same field names), paid only
// while no projection value is served.
function useSessionStats(useChat: StatPillProps['useChat'], useProjection: UseProjection): WindowStats {
  const settledNodes = useChat(s => s.legacy.nodes)
  const projected = useProjection('sessionStats')
  return useMemo(() => projected ?? deriveStats(settledNodes), [projected, settledNodes])
}

function decodeTps(stats: WindowStats, t: Translate): string {
  return t('message.tokensPerSecond', {
    tps: formatTokensPerSecond(stats.decodeTokens / (stats.decodeMs / 1_000)),
  })
}

/** The full reading above a pill, only while an ellipsis cuts its label; the delay matches the dock's context meter. */
const FULL_READING_TOOLTIP = { side: 'top', portal: true, delayMs: 200, onlyWhenClipped: true } as const

/** TTFT-inclusive figure as a bare number, for the parenthesized reading. */
function e2eTpsValue(stats: WindowStats): string {
  return formatTokensPerSecond(stats.e2eTokens / (stats.e2eMs / 1_000))
}

function e2eTps(stats: WindowStats, t: Translate): string {
  return t('message.tokensPerSecond', { tps: e2eTpsValue(stats) })
}

/** Decode speed, with the TTFT-inclusive speed in parentheses when its window has timed steps. */
function decodeSpeed(stats: WindowStats, t: Translate): string {
  const decode = decodeTps(stats, t)
  if (stats.e2eMs <= 0) return decode
  return `${decode} ${t('stats.speed.e2e', { tps: e2eTpsValue(stats) })}`
}

/** A static reading: used when the pill has no dialog rows or the mode is Compact. */
function PlainPill({ stat, icon, label, text }: PillContent) {
  return (
    <span className={css.anchor} data-composer-stat={stat}>
      {/* No dialog carries a static reading, so a tap also pins the full text. */}
      <Tooltip label={text} {...FULL_READING_TOOLTIP} openOnClick>
        <span className={css.pill}>
          {icon}
          <span className={css.label}>{label}</span>
        </span>
      </Tooltip>
    </span>
  )
}

/**
 * A pill button opening its own portaled dialog. Each pill owns its open
 * state; useStatDialog closes it on Escape or an outside pointerdown or click,
 * so at most one dialog is open across the dock.
 */
function DialogPill({ stat, icon, label, text, title, titleValue, children }: PillContent & {
  title: string
  titleValue?: string
  children: ReactNode
}) {
  const { open, setOpen, rootRef, panelRef, pos } = useStatDialog()
  return (
    <span ref={rootRef} className={css.anchor} data-composer-stat={stat}>
      {/* The open dialog already shows every figure; a tooltip would cover it. */}
      <Tooltip label={text} {...FULL_READING_TOOLTIP} disabled={open}>
        <button
          type="button"
          className={css.pill}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={text}
          onClick={() => { setOpen(!open) }}
        >
          {icon}
          <span className={css.label}>{label}</span>
        </button>
      </Tooltip>
      {open && createPortal(
        <div
          ref={panelRef}
          className={dialogCss.panel}
          role="dialog"
          aria-label={title}
          style={pos ?? MEASURE_STYLE}
        >
          <div className={dialogCss.title}>
            <span className={dialogCss.titleLabel}>
              {icon}
              {title}
            </span>
            {titleValue !== undefined && <span className={dialogCss.titleValue}>{titleValue}</span>}
          </div>
          <div className={dialogCss.titleRule} aria-hidden />
          {children}
        </div>,
        document.body,
      )}
    </span>
  )
}

/**
 * Turn and step counts with whole-session speed, opening the time and speed
 * dialog; Compact keeps only the speed reading.
 */
export const ActivityPill = memo(function ActivityPill({ useChat, useProjection, usePerformanceUsage, t }: StatPillProps) {
  const mode = usePerformanceUsage(value => value)
  const stats = useSessionStats(useChat, useProjection)
  // Absent until the llm-network-stats plugin is mounted beside the projection
  // registry, so an assembly without it renders exactly the rows it did before.
  const network = useProjection('llmNetworkStats')
  const lastRequest = network !== undefined && network.requests > 0 ? network.last : null
  const speed = stats.decodeMs > 0 ? decodeSpeed(stats, t) : null
  const icon = <IconGaugeOutlineRegular />
  if (mode === 'compact') return speed === null ? null : <PlainPill stat="activity" icon={icon} {...reading(speed, null)} />
  if (stats.steps === 0) return null
  const counts = t('stats.counts', { turns: stats.turns, steps: stats.steps })
  const content: PillContent = { stat: 'activity', icon, ...reading(counts, speed) }
  // A session without one timed figure has no dialog rows to show, so the pill
  // stays a plain reading instead of a button opening an empty dialog.
  if (stats.llmMs <= 0 && stats.toolMs <= 0 && stats.ttftSteps <= 0 && speed === null && lastRequest === null) {
    return <PlainPill {...content} />
  }
  return (
    // The counts head the dialog, so a cut-off reading stays complete once the dialog opens.
    <DialogPill {...content} title={t('stats.dialog.title')} titleValue={counts}>
      <dl className={dialogCss.details} data-session-stats-details>
        {stats.llmMs > 0 && (
          <>
            <dt>{t('stats.dialog.llmTime')}</dt>
            <dd>{formatDuration(stats.llmMs, t)}</dd>
          </>
        )}
        {stats.toolMs > 0 && (
          <>
            <dt>{t('stats.dialog.toolTime')}</dt>
            <dd>{formatDuration(stats.toolMs, t)}</dd>
          </>
        )}
        {stats.ttftSteps > 0 && (
          <>
            <dt>{t('stats.dialog.ttft')}</dt>
            <dd>{formatDuration(stats.ttftMs / stats.ttftSteps, t)}</dd>
          </>
        )}
        {speed !== null && (
          <>
            <dt>{t('stats.dialog.speed')}</dt>
            <dd>{decodeTps(stats, t)}</dd>
            {stats.e2eMs > 0 && (
              <>
                <dt>{t('stats.dialog.speedE2e')}</dt>
                <dd>{e2eTps(stats, t)}</dd>
              </>
            )}
          </>
        )}
        {network !== undefined && lastRequest !== null && (
          <>
            <dt>{t('stats.dialog.networkUpload')}</dt>
            <dd>{lastAverage(
              formatLatency(lastRequest.uploadMs, t),
              formatLatency(network.uploadMs / network.requests, t),
              t,
            )}</dd>
            <dt>{t('stats.dialog.networkResponse')}</dt>
            <dd>{lastAverage(
              formatLatency(lastRequest.responseMs, t),
              formatLatency(network.responseMs / network.requests, t),
              t,
            )}</dd>
            {/* Only a route that compressed something has sizes to compare. */}
            {network.compressedRequests > 0 && (
              <>
                <dt>{t('stats.dialog.networkCompression')}</dt>
                <dd>{t('stats.network.compressionReading', {
                  lastBefore: formatBytes(lastRequest.requestBytes, t),
                  lastAfter: formatBytes(lastRequest.sentBytes, t),
                  lastPercent: compressionPercent(lastRequest.sentBytes, lastRequest.requestBytes),
                  averagePercent: compressionPercent(network.sentBytes, network.requestBytes),
                })}</dd>
              </>
            )}
          </>
        )}
      </dl>
      {speed !== null && <p className={dialogCss.note}>{t('stats.dialog.speedNote')}</p>}
      {lastRequest !== null && <p className={dialogCss.note}>{t('stats.dialog.networkNote')}</p>}
    </DialogPill>
  )
})

/** Whole-log token total and cache hit; Compact keeps only the cache hit. */
export const UsagePill = memo(function UsagePill({ useProjection, usePerformanceUsage, t }: StatPillProps) {
  const mode = usePerformanceUsage(value => value)
  const usage = useProjection('tokenUsage')
  // Gated on actual token activity: a session whose steps all settled without
  // billing (e.g. every request failed) shows no usage pill.
  if (usage === undefined || (billedInputTokens(usage) === 0 && usage.outputTokens === 0)) return null
  const cacheHit = cacheHitPercent(usage)
  const cacheHitText = cacheHit !== null ? t('stats.cacheHit', { percent: cacheHit }) : null
  const icon = <IconDatabaseOutlineRegular />
  if (mode === 'compact') {
    return cacheHitText === null ? null : <PlainPill stat="usage" icon={icon} {...reading(cacheHitText, null)} />
  }
  // Same aggregate as the Turn pill's totalTokens: every prompt-side billing bucket plus output.
  const total = billedInputTokens(usage) + usage.outputTokens
  const totalText = t('message.turnUsage.count', { count: formatTokens(total, t) })
  return (
    <DialogPill
      stat="usage"
      icon={icon}
      {...reading(totalText, cacheHitText)}
      title={t('stats.dialog.usageTitle')}
      titleValue={exactCount(total, t)}
    >
      {/* jscpd:ignore-start -- the session-total bucket rows deliberately mirror
          TurnUsagePanel's per-turn dl: same skin, different data contract (the
          buckets are always present here; per-turn fields are optional). A
          session that never wrote cache drops the row, as the per-turn panel
          drops its absent fields. */}
      <dl className={dialogCss.details} data-session-stats-usage>
        {cacheHit !== null && (
          <>
            <dt>{t('message.turnUsage.cacheHit')}</dt>
            <dd>{`${cacheHit}%`}</dd>
          </>
        )}
        <dt>{t('message.turnUsage.input')}</dt>
        <dd>{exactCount(usage.uncachedInputTokens, t)}</dd>
        <dt>{t('message.turnUsage.cacheRead')}</dt>
        <dd>{exactCount(usage.cacheReadTokens, t)}</dd>
        {usage.cacheWriteTokens !== 0 && (
          <>
            <dt>{t('message.turnUsage.cacheWrite')}</dt>
            <dd>{exactCount(usage.cacheWriteTokens, t)}</dd>
          </>
        )}
        <dt>{t('message.turnUsage.output')}</dt>
        <dd>{exactCount(usage.outputTokens, t)}</dd>
      </dl>
      {/* jscpd:ignore-end */}
    </DialogPill>
  )
})
