/** Business days and business time over a `BusinessCalendar`. */
import { isPlainTime, timeParts } from '@pyreon/time/core'
import type { Duration, PlainDate, PlainDateTime } from '@pyreon/time/core'
import { DAY, HOUR, MINUTE, readDay, readWall, weekdayOf, writeDate, writeWall } from './civil'
import { timeMs } from './durations'
import { badRange, badValue, guard, show } from './errors'
import type { BusinessCalendar } from './types'

/** Days the search for a business day or an opening runs before it gives up (a calendar with no open day at all). */
const MAX_SCAN_DAYS = 3660
const MAX_STEPS = 1_000_000

type Windows = [number, number][]

interface Cal {
  weekend: boolean[]
  holiday: (day: number) => boolean
  /** Opening windows by weekday, in ms from midnight; a window may end after `DAY` (overnight). `null` when there are no hours. */
  windows: Windows[] | null
  /** A date's own windows from `specialHours` (they replace the weekday's and win over `weekend` and `holidays`), or `undefined`. */
  special: (day: number) => Windows | undefined
  fn: string
}

function holidayTest(fn: string, holidays: BusinessCalendar['holidays']): (day: number) => boolean {
  if (holidays === undefined) return () => false
  if (typeof holidays === 'function') {
    return (day) => {
      const date = writeDate(day)

      let answer: unknown

      try {
        answer = holidays(date)
      } catch (error) {
        return badRange(fn, `the holidays predicate threw for ${date}: ${error instanceof Error ? error.message : String(error)}. A holidays predicate must return a boolean for every date.`)
      }
      if (typeof answer !== 'boolean') return badRange(fn, `the holidays predicate returned ${show(answer)} for ${date}. A holidays predicate must return true or false for every date.`)

      return answer
    }
  }
  if (!Array.isArray(holidays)) return badValue(fn, 'holidays to be an array of PlainDate or a predicate (date) => boolean', holidays)
  const set = new Set<number>()

  for (const h of holidays as unknown[]) set.add(readDay(fn, 'a holiday', h))

  return (day) => set.has(day)
}

function todOf(fn: string, v: unknown): number {
  if (!isPlainTime(v)) return badValue(fn, 'a window time to be a PlainTime ("09:00")', v)
  const t = timeParts(v)

  return t.hour * HOUR + t.minute * MINUTE + t.second * 1000 + t.millisecond
}

/** One list of `{ from, to }` windows as merged, sorted ms intervals from midnight (overnight windows end after `DAY`). */
function windowList(fn: string, label: string, list: unknown): Windows {
  if (!Array.isArray(list)) return badValue(fn, `${label} to be an array of { from, to }`, list)
  const merged: Windows = []

  for (const entry of list as { from: unknown; to: unknown }[]) {
    const from = todOf(fn, entry?.from)
    let to = todOf(fn, entry?.to)

    if (to === from && from !== 0) return badRange(fn, `the window ${show(entry)} is empty (from equals to). Remove it; for a whole day use { from: "00:00", to: "00:00" }.`)
    if (to <= from) to += DAY
    merged.push([from, to])
  }
  merged.sort((a, b) => a[0] - b[0])
  const joined: Windows = []

  for (const m of merged) {
    const last = joined[joined.length - 1]

    if (last !== undefined && m[0] <= last[1]) last[1] = Math.max(last[1], m[1])
    else joined.push([m[0], m[1]])
  }

  return joined
}

function windowsOf(fn: string, hours: NonNullable<BusinessCalendar['hours']>): Windows[] {
  const out: Windows[] = [[], [], [], [], [], [], [], []]

  if (typeof hours !== 'object' || hours === null) return badValue(fn, 'hours to be an object { 1: [{ from, to }], ... }', hours)
  for (const key of Object.keys(hours)) {
    const w = Number(key)

    if (!Number.isInteger(w) || w < 1 || w > 7) return badRange(fn, `hours has the key ${show(key)}; keys are ISO weekdays 1 (Monday) to 7 (Sunday).`)
    out[w] = windowList(fn, `hours[${key}]`, (hours as Record<string, unknown>)[key])
  }

  return out
}

const NO_SPECIAL = (): undefined => undefined

function specialTest(fn: string, special: BusinessCalendar['specialHours']): (day: number) => Windows | undefined {
  if (special === undefined) return NO_SPECIAL
  if (typeof special === 'function') {
    const seen = new Map<number, Windows | undefined>()

    return (day) => {
      if (seen.has(day)) return seen.get(day)
      const date = writeDate(day)
      let answer: unknown

      try {
        answer = special(date)
      } catch (error) {
        return badRange(fn, `the specialHours function threw for ${date}: ${error instanceof Error ? error.message : String(error)}. It must return the windows of a date, or undefined for the usual hours.`)
      }
      if (answer !== undefined && !Array.isArray(answer)) {
        return badRange(fn, `the specialHours function returned ${show(answer)} for ${date}. It must return an array of { from, to } (empty = closed), or undefined for the usual hours.`)
      }
      const windows = answer === undefined ? undefined : windowList(fn, `specialHours(${date})`, answer)

      seen.set(day, windows)

      return windows
    }
  }
  if (typeof special !== 'object' || special === null || Array.isArray(special)) {
    return badValue(fn, 'specialHours to be an object { "2026-12-24": [{ from, to }] } or a function (date) => windows | undefined', special)
  }
  const map = new Map<number, Windows>()

  for (const key of Object.keys(special)) map.set(readDay(fn, 'a specialHours date', key), windowList(fn, `specialHours[${key}]`, (special as Record<string, unknown>)[key]))

  return (day) => map.get(day)
}

function calendarOf(fn: string, calendar: BusinessCalendar | undefined, needHours: boolean): Cal {
  const c = calendar === undefined ? {} : calendar

  if (typeof c !== 'object' || c === null) return badValue(fn, 'a BusinessCalendar object', calendar, 'Pass something like { weekend: [6, 7], hours: { 1: [{ from: "09:00", to: "17:00" }] } }.')
  const weekend: boolean[] = [false, false, false, false, false, false, false, false]

  for (const w of c.weekend ?? [6, 7]) {
    if (!Number.isInteger(w) || w < 1 || w > 7) return badRange(fn, `weekend entries are ISO weekdays 1 to 7, got ${show(w)}.`)
    weekend[w] = true
  }
  if (needHours && c.hours === undefined && c.specialHours === undefined) return badRange(fn, 'the calendar has no hours, so there is no working time to count. Add hours: { 1: [{ from: "09:00", to: "17:00" }], ... }.')

  return { weekend, holiday: holidayTest(fn, c.holidays), windows: c.hours === undefined ? null : windowsOf(fn, c.hours), special: specialTest(fn, c.specialHours), fn }
}

/** Whether a date is a business day: its own `specialHours` entry decides when it has one (empty = closed), else the weekend and holidays. */
function isOpenDay(cal: Cal, day: number): boolean {
  const own = cal.special(day)

  return own !== undefined ? own.length > 0 : !cal.weekend[weekdayOf(day)] && !cal.holiday(day)
}

/** The opening windows of a date: its `specialHours` entry, else its weekday's hours on a business day, else none. The one place hours are read. */
function windowsOn(cal: Cal, day: number): Windows {
  const own = cal.special(day)

  if (own !== undefined) return own

  return !cal.weekend[weekdayOf(day)] && !cal.holiday(day) ? (cal.windows?.[weekdayOf(day)] ?? []) : []
}

/**
 * Is this date a business day: not on the calendar's `weekend` (default Saturday and Sunday) and not a holiday? A date with
 * its own `specialHours` entry is a business day when that entry has a window, whatever the weekend and holidays say.
 *
 * @example isBusinessDay('2026-11-18', {}) // => true
 * @example isBusinessDay('2026-11-21', {}) // => false
 * @example isBusinessDay('2026-12-25', { holidays: ['2026-12-25'] }) // => false
 */
export const isBusinessDay = /* @__PURE__ */ guard('isBusinessDay', function isBusinessDay(date: PlainDate | PlainDateTime, calendar: BusinessCalendar): boolean {
  const cal = calendarOf('isBusinessDay', calendar, false)

  return isOpenDay(cal, Math.floor(readWall('isBusinessDay', 'date', date).wall / DAY))
})

function stepDays(cal: Cal, from: number, direction: 1 | -1, count: number): number {
  let day = from
  let left = count

  while (left > 0) {
    let scanned = 0

    do {
      day += direction
      if (++scanned > MAX_SCAN_DAYS) badRange(cal.fn, `no business day within ${MAX_SCAN_DAYS} days of ${writeDate(from)}: every day is a weekend or a holiday in this calendar.`)
    } while (!isOpenDay(cal, day))
    left--
  }

  return day
}

/**
 * Move by `n` business days (negative goes back). `n` of 0 returns the date unchanged, even when it is not a business day;
 * otherwise the first step is from the date itself, so Friday plus 1 is Monday and Saturday plus 1 is Monday as well.
 *
 * @example addBusinessDays('2026-11-20', 1, {}) // => '2026-11-23'
 * @example addBusinessDays('2026-11-23', -1, {}) // => '2026-11-20'
 * @example addBusinessDays('2026-12-24', 2, { holidays: ['2026-12-25'] }) // => '2026-12-29'
 */
export const addBusinessDays = /* @__PURE__ */ guard('addBusinessDays', function addBusinessDays(date: PlainDate, n: number, calendar: BusinessCalendar): PlainDate {
  const cal = calendarOf('addBusinessDays', calendar, false)
  const day = readDay('addBusinessDays', 'date', date)

  if (typeof n !== 'number' || !Number.isInteger(n) || Math.abs(n) > MAX_STEPS) return badRange('addBusinessDays', `n must be a whole number of days, at most ${MAX_STEPS} either way, got ${show(n)}.`)

  return n === 0 ? writeDate(day) : writeDate(stepDays(cal, day, n > 0 ? 1 : -1, Math.abs(n)))
})

/**
 * The business days from `a` (included) to `b` (excluded), negative when `b` is before `a`.
 *
 * @example businessDaysBetween('2026-11-16', '2026-11-23', {}) // => 5
 * @example businessDaysBetween('2026-11-23', '2026-11-16', {}) // => -5
 */
export const businessDaysBetween = /* @__PURE__ */ guard('businessDaysBetween', function businessDaysBetween(a: PlainDate, b: PlainDate, calendar: BusinessCalendar): number {
  const cal = calendarOf('businessDaysBetween', calendar, false)
  const from = readDay('businessDaysBetween', 'a', a)
  const to = readDay('businessDaysBetween', 'b', b)
  const lo = Math.min(from, to)
  const hi = Math.max(from, to)
  let n = 0

  for (let d = lo; d < hi; d++) if (isOpenDay(cal, d)) n++

  return from <= to ? n : -n
})

/**
 * The first business day after `date`.
 *
 * @example nextBusinessDay('2026-11-20', {}) // => '2026-11-23'
 */
export const nextBusinessDay = /* @__PURE__ */ guard('nextBusinessDay', function nextBusinessDay(date: PlainDate, calendar: BusinessCalendar): PlainDate {
  return writeDate(stepDays(calendarOf('nextBusinessDay', calendar, false), readDay('nextBusinessDay', 'date', date), 1, 1))
})

/**
 * The last business day before `date`.
 *
 * @example previousBusinessDay('2026-11-23', {}) // => '2026-11-20'
 */
export const previousBusinessDay = /* @__PURE__ */ guard('previousBusinessDay', function previousBusinessDay(date: PlainDate, calendar: BusinessCalendar): PlainDate {
  return writeDate(stepDays(calendarOf('previousBusinessDay', calendar, false), readDay('previousBusinessDay', 'date', date), -1, 1))
})

/** The merged opening intervals (ms) that overlap `[lo, hi)`, not clipped: an interval may start before `lo` or end after `hi`. */
function openIntervals(cal: Cal, lo: number, hi: number): [number, number][] {
  const out: [number, number][] = []

  for (let day = Math.floor(lo / DAY) - 1; day <= Math.floor((hi - 1) / DAY); day++) {
    for (const [from, to] of windowsOn(cal, day)) {
      const s = day * DAY + from
      const e = day * DAY + to

      if (e > lo && s < hi) out.push([s, e])
    }
  }
  out.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []

  for (const iv of out) {
    const last = merged[merged.length - 1]

    if (last !== undefined && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1])
    else merged.push([iv[0], iv[1]])
  }

  return merged
}

/**
 * Add working time: "8 working hours from Friday 15:00" is Monday 15:00 for 09:00 to 17:00 days. Time outside opening hours
 * does not count; a result at the end of a window stays at the closing time. A negative duration goes back. Hours need a
 * calendar with `hours`; an overnight window (`22:00` to `06:00`) belongs to the day it starts on.
 *
 * @example addBusinessTime('2026-11-20T15:00', { hours: 8 }, { hours: { 1: [{ from: '09:00', to: '17:00' }], 5: [{ from: '09:00', to: '17:00' }] } }) // => '2026-11-23T15:00'
 */
export const addBusinessTime = /* @__PURE__ */ guard('addBusinessTime', function addBusinessTime(start: PlainDateTime, duration: Duration, calendar: BusinessCalendar): PlainDateTime {
  const cal = calendarOf('addBusinessTime', calendar, true)
  const t0 = readWall('addBusinessTime', 'start', start).wall
  const total = timeMs('addBusinessTime', 'duration', duration, 'any')

  if (total === 0) return writeWall(t0)
  const forward = total > 0
  let rest = Math.abs(total)
  let edge = t0
  let span = 7 * DAY
  let idle = 0

  for (;;) {
    const lo = forward ? edge : edge - span
    const hi = forward ? edge + span : edge
    const list = openIntervals(cal, lo, hi)

    for (const iv of forward ? list : list.reverse()) {
      const s = Math.max(iv[0], lo, forward ? edge : -Infinity)
      const e = Math.min(iv[1], hi)

      if (e <= s) continue
      const room = e - s

      if (rest <= room) return writeWall(forward ? s + rest : e - rest)
      rest -= room
    }
    idle = list.length === 0 ? idle + span : 0
    if (idle > MAX_SCAN_DAYS * DAY) return badRange('addBusinessTime', `the calendar has no open hours within ${MAX_SCAN_DAYS} days of ${start}.`)
    edge = forward ? hi : lo
    span *= 2
  }
})

/**
 * The working time between two moments, as `{ hours, minutes }` (plus `seconds` and `milliseconds` when not zero); negative
 * when `b` is before `a`.
 *
 * @example businessTimeBetween('2026-11-20T15:00', '2026-11-23T11:00', { hours: { 1: [{ from: '09:00', to: '17:00' }], 5: [{ from: '09:00', to: '17:00' }] } }) // => { hours: 4, minutes: 0 }
 */
export const businessTimeBetween = /* @__PURE__ */ guard('businessTimeBetween', function businessTimeBetween(a: PlainDateTime, b: PlainDateTime, calendar: BusinessCalendar): Duration {
  const cal = calendarOf('businessTimeBetween', calendar, true)
  const from = readWall('businessTimeBetween', 'a', a).wall
  const to = readWall('businessTimeBetween', 'b', b).wall
  const lo = Math.min(from, to)
  const hi = Math.max(from, to)
  let ms = 0

  if (hi > lo) for (const [s, e] of openIntervals(cal, lo, hi)) ms += Math.max(0, Math.min(e, hi) - Math.max(s, lo))
  const sign = from <= to ? 1 : -1
  const out: { hours: number; minutes: number; seconds?: number; milliseconds?: number } = { hours: sign * Math.floor(ms / HOUR), minutes: sign * Math.floor((ms % HOUR) / MINUTE) }

  if (ms % MINUTE >= 1000) out.seconds = sign * Math.floor((ms % MINUTE) / 1000)
  if (ms % 1000 !== 0) out.milliseconds = sign * (ms % 1000)

  return normalizeZero(out)
})

/** `-0` is never returned: a zero duration has plain zeros. */
function normalizeZero(d: { hours: number; minutes: number; seconds?: number; milliseconds?: number }): Duration {
  return { ...d, hours: d.hours + 0, minutes: d.minutes + 0 }
}

/**
 * Is the calendar open at this moment? A window is half-open: open at its `from`, closed at its `to`.
 *
 * @example isOpen('2026-11-18T10:00', { hours: { 3: [{ from: '09:00', to: '17:00' }] } }) // => true
 * @example isOpen('2026-11-18T17:00', { hours: { 3: [{ from: '09:00', to: '17:00' }] } }) // => false
 */
export const isOpen = /* @__PURE__ */ guard('isOpen', function isOpen(at: PlainDateTime, calendar: BusinessCalendar): boolean {
  const cal = calendarOf('isOpen', calendar, true)
  const t = readWall('isOpen', 'at', at).wall

  return openIntervals(cal, t, t + 1).some(([s, e]) => s <= t && t < e)
})

function search(fn: string, at: PlainDateTime, calendar: BusinessCalendar, pick: (iv: [number, number], t: number) => number | null): PlainDateTime | null {
  const cal = calendarOf(fn, calendar, true)
  const t = readWall(fn, 'at', at).wall
  let span = 7 * DAY
  let lo = t

  while (lo - t < MAX_SCAN_DAYS * DAY) {
    for (const iv of openIntervals(cal, lo, lo + span)) {
      const w = pick(iv, t)

      if (w !== null) return writeWall(w)
    }
    lo += span
    span *= 2
  }

  return null
}

/**
 * The next time the calendar opens, strictly after `at` (when it is open now, the opening after the current window), or
 * `null` when it never opens within ten years.
 *
 * @example nextOpening('2026-11-20T18:00', { hours: { 1: [{ from: '09:00', to: '17:00' }], 5: [{ from: '09:00', to: '17:00' }] } }) // => '2026-11-23T09:00'
 */
export const nextOpening = /* @__PURE__ */ guard('nextOpening', function nextOpening(at: PlainDateTime, calendar: BusinessCalendar): PlainDateTime | null {
  return search('nextOpening', at, calendar, (iv, t) => (iv[0] > t ? iv[0] : null))
})

/**
 * The next time the calendar closes, strictly after `at`: the end of the current window when open, else of the next one.
 *
 * @example nextClosing('2026-11-20T10:00', { hours: { 5: [{ from: '09:00', to: '17:00' }] } }) // => '2026-11-20T17:00'
 */
export const nextClosing = /* @__PURE__ */ guard('nextClosing', function nextClosing(at: PlainDateTime, calendar: BusinessCalendar): PlainDateTime | null {
  return search('nextClosing', at, calendar, (iv, t) => (iv[1] > t ? iv[1] : null))
})

/** The opening intervals of a calendar clipped to `[lo, hi)`, in ms: what `freeSlots` intersects with. */
export function openWindow(fn: string, calendar: BusinessCalendar, lo: number, hi: number): [number, number][] {
  const cal = calendarOf(fn, calendar, true)

  return openIntervals(cal, lo, hi).map(([s, e]): [number, number] => [Math.max(s, lo), Math.min(e, hi)]).filter(([s, e]) => e > s)
}
