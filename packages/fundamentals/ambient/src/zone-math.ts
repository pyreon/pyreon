/**
 * The little zone arithmetic the day and hour tickers need: a UTC offset, and the next local boundary of a unit. It is
 * duplicated from nowhere on purpose: `@pyreon/time` depends on this package, so this package cannot import it. Formatters are
 * kept in a small bounded table (the oldest is dropped first).
 */
const MAX_FORMATTERS = 8
const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterOf(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone)

  if (f === undefined) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    if (formatters.size >= MAX_FORMATTERS) formatters.delete(formatters.keys().next().value as string)
    formatters.set(zone, f)
  }

  return f
}

/** Test hook: how many zone formatters are held. */
export function _formatterCount(): number {
  return formatters.size
}

/** Test hook: forget the formatters. */
export function _resetZoneMath(): void {
  formatters.clear()
}

/** UTC offset in milliseconds (east positive) of `zone` at the instant `t`. */
export function offsetMs(zone: string, t: number): number {
  const sec = Math.floor(t / 1000)
  const text = formatterOf(zone).format(sec * 1000)
  const n = [0, 0, 0, 0, 0, 0]
  let field = 0
  let inNumber = false

  for (let i = 0; i < text.length && field < 6; i++) {
    const c = text.charCodeAt(i) - 48

    if (c >= 0 && c <= 9) {
      n[field] = n[field]! * 10 + c
      inNumber = true
    } else if (inNumber) {
      field++
      inNumber = false
    }
  }

  // month, day, year, hour, minute, second as printed by en-US; the 24:00 some engines print for midnight is read as 0.
  return (Date.UTC(n[2]!, n[0]! - 1, n[1]!, n[3]! % 24, n[4]!, n[5]!) - sec * 1000)
}

/**
 * The first instant after `t` at which the local wall clock of `zone` enters a new `unit` (an hour or a day), found by
 * bisection, so it is exact on 23- and 25-hour days, across 30-minute DST shifts and across a skipped day. `unit` is in
 * milliseconds.
 */
export function nextLocalBoundary(zone: string, t: number, unit: number): number {
  const index = (x: number): number => Math.floor((x + offsetMs(zone, x)) / unit)
  const start = index(t)
  let lo = t
  let hi = t + unit + 3 * 3_600_000

  // The index only changes forward within this window, so "differs from the start" flips once.
  while (index(hi) === start) hi += unit
  while (hi - lo > 1) {
    const mid = lo + Math.floor((hi - lo) / 2)

    if (index(mid) === start) lo = mid
    else hi = mid
  }

  return hi
}
