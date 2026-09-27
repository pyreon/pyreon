import { effect, signal, untrack } from '@pyreon/reactivity'
import { onHookCleanup } from './lifecycle'

type TimeUnit = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'

interface TimeInterval {
  unit: TimeUnit
  seconds: number
}

const INTERVALS: TimeInterval[] = [
  { unit: 'year', seconds: 31536000 },
  { unit: 'month', seconds: 2592000 },
  { unit: 'week', seconds: 604800 },
  { unit: 'day', seconds: 86400 },
  { unit: 'hour', seconds: 3600 },
  { unit: 'minute', seconds: 60 },
  { unit: 'second', seconds: 1 },
]

/**
 * Determine how often to update based on the age of the timestamp.
 * Recent times update more frequently.
 */
function getRefreshInterval(diffSeconds: number): number {
  if (diffSeconds < 60) return 1000 // every second for <1min
  if (diffSeconds < 3600) return 30_000 // every 30s for <1hr
  if (diffSeconds < 86400) return 300_000 // every 5min for <1day
  return 3600_000 // every hour for older
}

export interface UseTimeAgoOptions {
  /**
   * Custom formatter. Receives the value, unit, and whether it's in the past.
   * The "just now" bucket (under 5 seconds) is passed as `(0, 'second', isPast)`.
   */
  formatter?: (value: number, unit: TimeUnit, isPast: boolean) => string
  /** Update interval override in ms. If not set, adapts based on age. */
  interval?: number
}

/**
 * Default English formatter using Intl.RelativeTimeFormat.
 */
/* v8 ignore start — Intl is always defined in Node/happy-dom test envs; SSR/no-Intl fallback exercised by downstream integration */
const defaultFormatter = (() => {
  const rtf =
    typeof Intl !== 'undefined' ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' }) : undefined

  return (value: number, unit: TimeUnit, isPast: boolean): string => {
    // The "just now" bucket arrives as `value === 0`. Kept as the literal
    // phrase for the default English formatter (Intl would say "now").
    if (value === 0) return 'just now'
    if (rtf) return rtf.format(isPast ? -value : value, unit)
    // Fallback for environments without Intl
    const label = value === 1 ? unit : `${unit}s`
    return isPast ? `${value} ${label} ago` : `in ${value} ${label}`
  }
})()
/* v8 ignore stop */

/**
 * Compute the relative time string for a given timestamp.
 */
function computeTimeAgo(
  date: Date | number,
  formatter: (value: number, unit: TimeUnit, isPast: boolean) => string,
): string {
  const now = Date.now()
  const target = typeof date === 'number' ? date : date.getTime()
  const diff = Math.abs(now - target)
  const diffSeconds = Math.floor(diff / 1000)
  const isPast = target < now

  // Routed through the formatter (as `0 seconds`) rather than returned as a
  // hard-coded English string, so an i18n formatter covers this bucket too.
  if (diffSeconds < 5) return formatter(0, 'second', isPast)

  for (const { unit, seconds } of INTERVALS) {
    const value = Math.floor(diffSeconds / seconds)
    if (value >= 1) return formatter(value, unit, isPast)
  }

  /* v8 ignore next — unreachable: line 68 returns for diffSeconds < 5, and the
     `second` interval (seconds=1) yields value = diffSeconds >= 5 >= 1, so the
     loop always returns first. Defensive fallback only. */
  return formatter(0, 'second', isPast)
}

/**
 * Reactive relative time that auto-updates.
 * Returns a signal that displays "2 minutes ago", "just now", etc.
 *
 * @param date - Date object, timestamp, or reactive getter
 *
 * @example
 * ```tsx
 * const timeAgo = useTimeAgo(post.createdAt)
 * <span>{timeAgo}</span>
 * // Renders: "5 minutes ago" → "6 minutes ago" (auto-updates)
 *
 * // With reactive date:
 * const timeAgo = useTimeAgo(() => selectedPost().createdAt)
 *
 * // With custom formatter (e.g. for i18n):
 * const timeAgo = useTimeAgo(date, {
 *   formatter: (value, unit, isPast) => t('time.' + unit, { count: value })
 * })
 * ```
 */
export function useTimeAgo(
  date: Date | number | (() => Date | number),
  options?: UseTimeAgoOptions,
): () => string {
  const formatter = options?.formatter ?? defaultFormatter
  const resolveDate = typeof date === 'function' ? date : () => date

  const result = signal('')

  // Disposed flag prevents timer chain from continuing after cleanup.
  // Without this, the setTimeout callback could fire after the component
  // unmounts, scheduling yet another timer indefinitely.
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  function render(d: Date | number): void {
    result.set(computeTimeAgo(d, formatter))
    // (Re)schedule with an adaptive interval — the age just changed, so the
    // refresh cadence may have too.
    if (timer !== undefined) clearTimeout(timer)
    const target = typeof d === 'number' ? d : d.getTime()
    const diffSeconds = Math.floor(Math.abs(Date.now() - target) / 1000)
    const interval = options?.interval ?? getRefreshInterval(diffSeconds)
    timer = setTimeout(tick, interval)
  }

  function tick(): void {
    if (disposed) return
    render(untrack(resolveDate))
  }

  // The date is read INSIDE an effect so a reactive getter is tracked: a
  // change re-renders immediately and restarts the timer. It used to be read
  // only by the timer, so `useTimeAgo(() => post().createdAt)` kept showing
  // the previous post's age until the next tick (up to an hour later).
  const e = effect(() => {
    const d = resolveDate()
    untrack(() => render(d))
  })

  onHookCleanup(() => {
    disposed = true
    e.dispose()
    /* v8 ignore next — `timer` is always a live timeout id here (render()
       runs synchronously in the effect above, before this registers). */
    if (timer !== undefined) clearTimeout(timer)
  })

  return result
}
