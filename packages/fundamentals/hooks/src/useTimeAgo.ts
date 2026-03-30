import { onCleanup, signal } from '@pyreon/reactivity'

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
  /** Custom formatter. Receives the value, unit, and whether it's in the past. */
  formatter?: (value: number, unit: TimeUnit, isPast: boolean) => string
  /** Update interval override in ms. If not set, adapts based on age. */
  interval?: number
}

/**
 * Default English formatter using Intl.RelativeTimeFormat.
 */
const defaultFormatter = (() => {
  const rtf =
    typeof Intl !== 'undefined' ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' }) : undefined

  return (value: number, unit: TimeUnit, isPast: boolean): string => {
    if (rtf) return rtf.format(isPast ? -value : value, unit)
    // Fallback for environments without Intl
    const label = value === 1 ? unit : `${unit}s`
    return isPast ? `${value} ${label} ago` : `in ${value} ${label}`
  }
})()

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

  if (diffSeconds < 5) return 'just now'

  for (const { unit, seconds } of INTERVALS) {
    const value = Math.floor(diffSeconds / seconds)
    if (value >= 1) return formatter(value, unit, isPast)
  }

  return 'just now'
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

  const result = signal(computeTimeAgo(resolveDate(), formatter))

  // Disposed flag prevents timer chain from continuing after cleanup.
  // Without this, the setTimeout callback could fire after the component
  // unmounts, scheduling yet another timer indefinitely.
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  function tick() {
    if (disposed) return

    const d = resolveDate()
    result.set(computeTimeAgo(d, formatter))

    // Schedule next update with adaptive interval
    const target = typeof d === 'number' ? d : d.getTime()
    const diffSeconds = Math.floor(Math.abs(Date.now() - target) / 1000)
    const interval = options?.interval ?? getRefreshInterval(diffSeconds)
    timer = setTimeout(tick, interval)
  }

  // Schedule first tick (don't call synchronously — let cleanup register first)
  timer = setTimeout(tick, 0)

  onCleanup(() => {
    disposed = true
    if (timer) clearTimeout(timer)
  })

  return result
}
