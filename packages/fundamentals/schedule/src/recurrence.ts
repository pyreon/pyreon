import { isTimeZone, toInstant, toPlainDateTime } from '@pyreon/time/core'
import type { Disambiguation, Instant, PlainDate, PlainDateTime, TimeZone } from '@pyreon/time/core'
import { DAY, readDay, readWall, writeDate, writeWall } from './civil'
import { badRange, badValue, guard } from './errors'
import { firstFrom, lastUpTo, walk } from './expand'
import { compile, type Plan } from './plan'
import type { OccurrenceRange, PlainValue, Recurrence } from './types'

/** More occurrences than this need an explicit `limit`: it protects `Array.from(occurrences(rule))` on an endless rule. */
export const SAFETY_CAP = 1_000_000

const write = (plan: Plan, wall: number): PlainValue => (plan.dateOnly ? writeDate(Math.floor(wall / DAY)) : writeWall(wall))

/** First moment a bound includes: a date is the start of that day. */
function lowerOf(fn: string, what: string, v: unknown): number {
  return readWall(fn, what, v).wall
}

/** Last moment a bound includes: a date is the end of that day. */
function upperOf(fn: string, what: string, v: unknown): number {
  const r = readWall(fn, what, v)

  return r.dateOnly ? r.wall + DAY - 1 : r.wall
}

function limitOf(fn: string, limit: unknown): number {
  if (limit === undefined) return Infinity

  return typeof limit === 'number' && Number.isInteger(limit) && limit >= 0 ? limit : badRange(fn, `limit must be a whole number from 0, got ${String(limit)}.`)
}

function boundsOf(fn: string, range: OccurrenceRange | undefined): { lo: number; hi: number; limit: number } {
  if (range !== undefined && (typeof range !== 'object' || range === null)) return badValue(fn, 'a range object { from?, to?, limit? }', range)

  return {
    lo: range?.from === undefined ? -Infinity : lowerOf(fn, 'from', range.from),
    hi: range?.to === undefined ? Infinity : upperOf(fn, 'to', range.to),
    limit: limitOf(fn, range?.limit),
  }
}

function* expand(fn: string, plan: Plan, lo: number, hi: number, limit: number): Generator<PlainValue, void, undefined> {
  let n = 0

  if (limit === 0) return
  for (const w of walk(plan, lo, hi)) {
    yield write(plan, w)
    if (++n >= limit) return
    if (limit === Infinity && n >= SAFETY_CAP) badRange(fn, `more than ${SAFETY_CAP} occurrences were asked for. Pass { to } or { limit } to say how many you want.`)
  }
}

/**
 * The occurrences of a rule, lazily and in order. A rule with neither `until` nor `count` is endless: bound it with `to` or
 * `limit` (a date bound means the whole day). The generator never steps through the time between occurrences: it computes
 * each period's candidates and jumps to `from`. The rule is checked when `occurrences` is called, not on the first `next()`.
 *
 * Every rule part follows RFC 5545 section 3.3.10, with these readings: `start` is not an occurrence unless the rule produces
 * it; `count` counts the rule's own occurrences, so a date in `except` still uses one up; and a month day that a month lacks
 * (the 31st in April) is skipped, never clamped.
 *
 * @example [...occurrences({ every: 'week', start: '2026-11-17' }, { limit: 3 })] // => ['2026-11-17', '2026-11-24', '2026-12-01']
 * @example [...occurrences({ every: 'month', start: '2026-01-31' }, { limit: 3 })] // => ['2026-01-31', '2026-03-31', '2026-05-31']
 */
export const occurrences = /* @__PURE__ */ guard('occurrences', function occurrences(rule: Recurrence, range?: OccurrenceRange): Generator<PlainValue, void, undefined> {
  const plan = compile('occurrences', rule)
  const b = boundsOf('occurrences', range)

  return expand('occurrences', plan, b.lo, b.hi, b.limit)
})

/**
 * Every occurrence from `from` to `to`, both included (a date bound means the whole day), as an array.
 *
 * @example occurrencesBetween({ every: 'day', start: '2026-11-01' }, '2026-11-03', '2026-11-05') // => ['2026-11-03', '2026-11-04', '2026-11-05']
 * @example occurrencesBetween({ every: 'day', start: '2026-11-01T09:00' }, '2026-11-03', '2026-11-04') // => ['2026-11-03T09:00', '2026-11-04T09:00']
 */
export const occurrencesBetween = /* @__PURE__ */ guard('occurrencesBetween', function occurrencesBetween(rule: Recurrence, from: PlainValue, to: PlainValue): PlainValue[] {
  const plan = compile('occurrencesBetween', rule)
  const lo = lowerOf('occurrencesBetween', 'from', from)
  const hi = upperOf('occurrencesBetween', 'to', to)

  return [...expand('occurrencesBetween', plan, lo, hi, Infinity)]
})

/**
 * The first occurrence strictly after `after` (a date means after that whole day), or `null` when there is none. It jumps
 * to the period of `after`, so a rule that started ten years ago costs the same as a new one (unless it has a `count`, which
 * must be counted from the start).
 *
 * @example nextOccurrence({ every: 'month', start: '2026-01-31' }, '2026-02-01') // => '2026-03-31'
 * @example nextOccurrence({ every: 'day', start: '2026-01-01', count: 3 }, '2026-01-03') // => null
 */
export const nextOccurrence = /* @__PURE__ */ guard('nextOccurrence', function nextOccurrence(rule: Recurrence, after: PlainValue): PlainValue | null {
  const plan = compile('nextOccurrence', rule)
  const r = readWall('nextOccurrence', 'after', after)
  const w = firstFrom(plan, r.dateOnly ? r.wall + DAY : r.wall + 1)

  return w === null ? null : write(plan, w)
})

/**
 * The last occurrence strictly before `before` (a date means before that whole day), or `null`.
 *
 * @example previousOccurrence({ every: 'week', start: '2026-11-02' }, '2026-11-18') // => '2026-11-16'
 */
export const previousOccurrence = /* @__PURE__ */ guard('previousOccurrence', function previousOccurrence(rule: Recurrence, before: PlainValue): PlainValue | null {
  const plan = compile('previousOccurrence', rule)
  const r = readWall('previousOccurrence', 'before', before)
  const w = lastUpTo(plan, r.wall - 1)

  return w === null ? null : write(plan, w)
})

/**
 * Does the rule have an occurrence on this date?
 *
 * @example occursOn({ every: 'week', start: '2026-11-17' }, '2026-11-24') // => true
 * @example occursOn({ every: 'week', start: '2026-11-17' }, '2026-11-25') // => false
 */
export const occursOn = /* @__PURE__ */ guard('occursOn', function occursOn(rule: Recurrence, date: PlainDate): boolean {
  const plan = compile('occursOn', rule)
  const day = readDay('occursOn', 'date', date) * DAY

  return firstFrom(plan, day, day + DAY - 1) !== null
})

/** Options of `toInstants`. */
export interface InstantOptions {
  /** What a wall time that does not exist (spring forward) or occurs twice (fall back) becomes. Default `'compatible'`. */
  disambiguation?: Disambiguation
}

/** Bounds of `toInstants`: wall-clock values read in the rule's zone, or instants. */
export interface InstantRange {
  from?: PlainValue | Instant
  to?: PlainValue | Instant
  limit?: number
}

function wallBound(fn: string, what: string, v: PlainValue | Instant | undefined, zone: TimeZone): PlainValue | undefined {
  if (v === undefined || typeof v !== 'number') return v
  if (!Number.isFinite(v)) return badValue(fn, `${what} to be a PlainDate, a PlainDateTime or an Instant`, v)

  return toPlainDateTime(v, zone) as PlainDateTime
}

/**
 * The occurrences as instants, through the rule's `timeZone`. Occurrences are wall-clock times, so a daily 09:00 stays 09:00
 * across a clock change while its instant moves by an hour. A wall time that does not exist on a spring-forward day (02:30)
 * follows `disambiguation`: `'compatible'` (the default) moves it forward to 03:30; one that occurs twice on a fall-back day
 * takes the first. Hourly and minutely rules run on the wall clock, so a repeated instant is emitted once.
 *
 * @example [...toInstants({ every: 'day', start: '2026-03-28T02:30', timeZone: 'Europe/Prague' }, { limit: 3 })].map((t) => new Date(t).toISOString()) // => ['2026-03-28T01:30:00.000Z', '2026-03-29T01:30:00.000Z', '2026-03-30T00:30:00.000Z']
 */
export const toInstants = /* @__PURE__ */ guard('toInstants', function toInstants(rule: Recurrence, range?: InstantRange, options?: InstantOptions): Generator<Instant, void, undefined> {
  const plan = compile('toInstants', rule)
  const zone = rule.timeZone

  if (zone === undefined || !isTimeZone(zone)) return badValue('toInstants', 'the rule to have a timeZone', zone, 'Set timeZone: "Europe/Prague" on the rule.')
  const b = boundsOf('toInstants', {
    ...(range?.from === undefined ? {} : { from: wallBound('toInstants', 'from', range.from, zone) as PlainValue }),
    ...(range?.to === undefined ? {} : { to: wallBound('toInstants', 'to', range.to, zone) as PlainValue }),
    ...(range?.limit === undefined ? {} : { limit: range.limit }),
  })
  const mode = options?.disambiguation ?? 'compatible'

  return instants(plan, zone, mode, b)
})

function* instants(plan: Plan, zone: TimeZone, mode: Disambiguation, b: { lo: number; hi: number; limit: number }): Generator<Instant, void, undefined> {
  let previous = NaN

  for (const value of expand('toInstants', plan, b.lo, b.hi, b.limit)) {
    const t = toInstant(value, zone, { disambiguation: mode })

    if (t === previous) continue
    previous = t
    yield t
  }
}
