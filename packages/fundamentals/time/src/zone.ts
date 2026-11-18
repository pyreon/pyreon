import { civilFromDays, daysFromCivil, MAX_DAY, MIN_DAY, MS_PER_DAY } from './civil'
import { D, dur, loadDuration, loadedTimeMs, MO, W, Y } from './duration'
import { shiftDay } from './arith'
import { badRange, badValue, DATE_HINT, DATETIME_HINT, show } from './errors'
import { parseDateAt, parseWall, SHAPE_DATE, SHAPE_DT, shapeOf, writeDay, writeTod, writeWall } from './text'
import type { Disambiguation, Duration, Instant, PlainDate, PlainDateTime, PlainTime, TimeZone } from './types'

/**
 * Time zones come from the platform: one cached `Intl.DateTimeFormat` per zone supplies the UTC offset at an instant, so
 * the package ships no tz database and always agrees with `Intl` (and therefore with `Date` and `Temporal`).
 *
 * Two bounded caches:
 * - the zone table (`ZONE_LIMIT` entries, FIFO: when full, the zone cached longest ago is dropped and rebuilt on its next
 *   use, which costs one formatter construction);
 * - per zone, a table of `SLOTS` recently computed offsets: a new offset takes the first of the two slots its instant
 *   hashes to and pushes that slot's previous entry into the second, dropping whatever was there.
 *
 * Neither grows with the number of instants queried.
 */
export const ZONE_LIMIT = 64
/** Prime, so the two probes of one conversion (one day either side, 144 ten-minute units apart; 288 mod 127 is not 0) never share a slot. */
const SLOTS = 127

interface ZoneEntry {
  name: string
  fmt: Intl.DateTimeFormat
  keys: Float64Array
  vals: Float64Array
}

const zones = new Map<string, ZoneEntry>()

function build(zone: string): ZoneEntry | undefined {
  try {
    // Plain 'en-US' is Gregorian with Latin digits by default; adding `-u-ca-gregory-nu-latn` costs about 5 ms more on the first
    // construction in JavaScriptCore for no change in output.
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })

    return { name: zone, fmt, keys: new Float64Array(SLOTS).fill(Number.NaN), vals: new Float64Array(SLOTS) }
  } catch {
    return undefined
  }
}

function entryOf(fn: string, zone: unknown): ZoneEntry {
  if (typeof zone !== 'string') return badValue(fn, 'a time zone name such as "Europe/Prague"', zone)
  const hit = zones.get(zone)

  if (hit !== undefined) return hit
  const made = build(zone)

  if (made === undefined) {
    return badRange(fn, `unknown time zone ${show(zone)}. Use an IANA name such as "Europe/Prague" or "UTC"; check user input with isTimeZone().`)
  }
  if (zones.size >= ZONE_LIMIT) zones.delete(zones.keys().next().value as string)
  zones.set(zone, made)

  return made
}

/** Number of cached zones (for tests). */
export function zoneCacheSize(): number {
  return zones.size
}

/** Forget every cached zone and offset (for tests). */
export function clearZoneCache(): void {
  zones.clear()
}

/**
 * Whether the platform knows this time zone name. Never throws; use it to check data before calling the zone functions,
 * which throw on an unknown zone.
 *
 * @example isTimeZone('Europe/Prague') // => true
 * @example isTimeZone('Mars/Olympus') // => false
 */
export function isTimeZone(x: unknown): x is TimeZone {
  return typeof x === 'string' && x !== '' && (zones.has(x) || build(x) !== undefined)
}

/** Wall-clock seconds (as if UTC) printed by `fmt` for the instant `sec * 1000`: month, day, year, hour, minute, second. */
function wallSeconds(fmt: Intl.DateTimeFormat, sec: number): number {
  const text = fmt.format(sec * 1000)
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

  return (daysFromCivil(n[2]!, n[0]!, n[1]!) * 86_400 + (n[3]! % 24) * 3600 + n[4]! * 60 + n[5]!)
}

function offsetIn(e: ZoneEntry, fn: string, t: number): number {
  const sec = Math.floor(t / 1000)
  const first = (((sec / 600) | 0) & 0x7fffffff) % SLOTS
  const second = (first + 53) % SLOTS

  if (e.keys[first] === sec) return e.vals[first]!
  if (e.keys[second] === sec) return e.vals[second]!
  if (!(t >= MIN_DAY * MS_PER_DAY - 86_400_000 * 2 && t <= (MAX_DAY + 3) * MS_PER_DAY)) return badRange(fn, `the instant ${t} is outside the supported range (years 0001-9999)`)
  const offset = (wallSeconds(e.fmt, sec) - sec) * 1000

  // Victim slot: the entry being displaced from its first slot moves to the second, so two keys that hash together both survive.
  e.keys[second] = e.keys[first]!
  e.vals[second] = e.vals[first]!
  e.keys[first] = sec
  e.vals[first] = offset

  return offset
}

/** UTC offset in milliseconds (east positive) of `zone` at the instant `t`. */
export function offsetMsAt(fn: string, zone: unknown, t: number): number {
  return zone === 'UTC' ? 0 : offsetIn(entryOf(fn, zone), fn, t)
}

/**
 * Minutes east of UTC at an instant.
 *
 * @example offsetAt(Date.UTC(2026, 6, 1), 'Europe/Prague') // => 120
 */
export function offsetAt(instant: Instant, zone: TimeZone): number {
  if (typeof instant !== 'number' || !Number.isFinite(instant)) return badValue('offsetAt', 'an Instant (epoch milliseconds)', instant)

  return offsetMsAt('offsetAt', zone, instant) / 60_000 + 0
}

const MIN_WALL = MIN_DAY * MS_PER_DAY
const MAX_WALL = (MAX_DAY + 1) * MS_PER_DAY

function wallOfInstant(fn: string, instant: number, zone: unknown): number {
  if (typeof instant !== 'number' || !Number.isFinite(instant)) return badValue(fn, 'an Instant (epoch milliseconds)', instant)
  const wall = Math.floor(instant) + offsetMsAt(fn, zone, instant)

  return wall >= MIN_WALL && wall < MAX_WALL ? wall : badRange(fn, `the local time of instant ${instant} in ${show(zone)} is outside years 0001-9999`)
}

/**
 * The wall-clock date and time of an instant in a zone.
 *
 * @example toPlainDateTime(0, 'Europe/Prague') // => '1970-01-01T01:00'
 */
export function toPlainDateTime(instant: Instant, zone: TimeZone): PlainDateTime {
  return writeWall(wallOfInstant('toPlainDateTime', instant, zone))
}

/**
 * The calendar date of an instant in a zone.
 *
 * @example toPlainDate(Date.UTC(2026, 10, 18, 23, 30), 'Asia/Tokyo') // => '2026-11-19'
 */
export function toPlainDate(instant: Instant, zone: TimeZone): PlainDate {
  return writeDay(Math.floor(wallOfInstant('toPlainDate', instant, zone) / MS_PER_DAY))
}

/**
 * The time of day of an instant in a zone.
 *
 * @example toPlainTime(Date.UTC(2026, 10, 18, 13, 30), 'Europe/Prague') // => '14:30'
 */
export function toPlainTime(instant: Instant, zone: TimeZone): PlainTime {
  const wall = wallOfInstant('toPlainTime', instant, zone)

  return writeTod(wall - Math.floor(wall / MS_PER_DAY) * MS_PER_DAY) as PlainTime
}

// ---------------------------------------------------------------------------------------------------------------------
// Wall clock -> instant, with Temporal's disambiguation
// ---------------------------------------------------------------------------------------------------------------------

const ONE_DAY = MS_PER_DAY

/**
 * The instant for a wall-clock time. Candidates come from the offsets one day before and one day after (offsets never
 * differ by more than a day's worth of transitions), as Temporal's reference algorithm does:
 * - one candidate: that instant;
 * - two (the clocks went back, so the time occurs twice): `earlier` and `compatible` take the first, `later` the second;
 * - none (the clocks jumped forward, so the time does not exist): `compatible` and `later` shift forward by the length
 *   of the gap, `earlier` shifts back by it.
 * `reject` throws in both of the last two cases.
 */
function resolveWall(fn: string, e: ZoneEntry, wall: number, mode: Disambiguation): number {
  const before = offsetIn(e, fn, wall - ONE_DAY)
  const after = offsetIn(e, fn, wall + ONE_DAY)

  if (before === after) return wall - before
  const u1 = wall - before
  const u2 = wall - after
  const ok1 = offsetIn(e, fn, u1) === before
  const ok2 = offsetIn(e, fn, u2) === after

  if (ok1 && ok2) {
    if (mode === 'reject') return badRange(fn, `${wallText(wall)} happens twice in ${e.name} (the clocks go back). Pass { disambiguation: 'earlier' | 'later' | 'compatible' } to pick one.`)

    return mode === 'later' ? Math.max(u1, u2) : Math.min(u1, u2)
  }
  if (ok1) return u1
  if (ok2) return u2

  return resolveGap(fn, e, wall, mode, after - before)
}

function resolveGap(fn: string, e: ZoneEntry, wall: number, mode: Disambiguation, length: number): number {
  if (mode === 'reject') return badRange(fn, `${wallText(wall)} does not exist in ${e.name} (the clocks jump forward). Pass { disambiguation: 'earlier' | 'later' | 'compatible' } to pick an instant.`)
  if (length <= 0) return badRange(fn, `${wallText(wall)} cannot be resolved in ${e.name}`)

  return mode === 'earlier' ? resolveWall(fn, e, wall - length, 'earlier') : resolveWall(fn, e, wall + length, 'later')
}

function wallText(wall: number): string {
  return writeWall(wall)
}

/**
 * Options of `toInstant`: `disambiguation` for a wall-clock time that does not exist or happens twice.
 *
 * @example const options: ToInstantOptions = { disambiguation: 'later' }
 */
export interface ToInstantOptions {
  /** Default `'compatible'`: the first of two, and the shifted-forward instant for a time that does not exist. */
  disambiguation?: Disambiguation
}

function modeOf(fn: string, options: ToInstantOptions | undefined): Disambiguation {
  const mode = options?.disambiguation ?? 'compatible'

  return mode === 'compatible' || mode === 'earlier' || mode === 'later' || mode === 'reject'
    ? mode
    : badRange(fn, `disambiguation must be 'compatible', 'earlier', 'later' or 'reject', got ${show(mode)}`)
}

/**
 * The instant at which a wall-clock time happens in a zone. A PlainDate means its midnight. A time in a DST gap or overlap
 * follows `options.disambiguation`: `compatible` (default), `earlier`, `later` or `reject` (Temporal's modes).
 *
 * @example toInstant('2026-03-29T02:30', 'Europe/Prague') // => Date.UTC(2026, 2, 29, 1, 30)
 * @example toInstant('2026-03-29T02:30', 'Europe/Prague', { disambiguation: 'earlier' }) // => Date.UTC(2026, 2, 29, 0, 30)
 */
export function toInstant(value: PlainDate | PlainDateTime, zone: TimeZone, options?: ToInstantOptions): Instant {
  const mode = modeOf('toInstant', options)
  const shape = typeof value === 'string' ? shapeOf(value) : -1
  let wall = Number.NaN

  if (shape === SHAPE_DATE && parseDateAt(value) >= 0) wall = daysFromDate(value)
  else if (shape === SHAPE_DT) wall = parseWall(value)
  if (Number.isNaN(wall)) return badValue('toInstant', `${DATETIME_HINT} or ${DATE_HINT}`, value)
  if (zone === 'UTC') return wall

  return resolveWall('toInstant', entryOf('toInstant', zone), wall, mode)
}

function daysFromDate(value: string): number {
  const p = parseDateAt(value)

  return daysFromCivil(p >> 9, (p >> 5) & 15, p & 31) * MS_PER_DAY
}

/**
 * Move an instant by a duration. Years, months, weeks and days move the zone's wall clock and need `zone`; hours and finer
 * move the instant itself.
 *
 * @example addInstant(Date.UTC(2026, 2, 28, 11, 0), { days: 1 }, 'Europe/Prague') // => Date.UTC(2026, 2, 29, 10, 0)
 * @example addInstant(Date.UTC(2026, 2, 28, 11, 0), { hours: 24 }) // => Date.UTC(2026, 2, 29, 11, 0)
 */
export function addInstant(instant: Instant, duration: Duration, zone?: TimeZone): Instant {
  if (typeof instant !== 'number' || !Number.isFinite(instant)) return badValue('addInstant', 'an Instant (epoch milliseconds)', instant)
  loadDuration('addInstant', duration, 1)
  const calendar = dur[Y] !== 0 || dur[MO] !== 0 || dur[W] !== 0 || dur[D] !== 0
  const time = loadedTimeMs()

  if (!calendar) return checkInstant(instant + time)
  if (zone === undefined) {
    return badRange('addInstant', 'adding years, months, weeks or days to an Instant needs a time zone, because a day is not always 24 hours: addInstant(now, { days: 1 }, "Europe/Prague"). For exactly 24 hours use { hours: 24 }.')
  }
  const wall = wallOfInstant('addInstant', instant, zone)
  const ms = Math.floor(wall / MS_PER_DAY)
  const p = civilFromDays(ms)
  const moved = shiftDay('addInstant', p) * MS_PER_DAY + (wall - ms * MS_PER_DAY)
  const base = zone === 'UTC' ? moved : resolveWall('addInstant', entryOf('addInstant', zone), moved, 'compatible')

  return checkInstant(base + time + (instant - Math.floor(instant)))
}

/** An Instant must stay inside what a `Date` can hold (about 275,760 years either side of 1970). */
function checkInstant(t: number): number {
  return Math.abs(t) <= 8.64e15 ? t : badRange('addInstant', 'the result is outside the range of a Date (about 275,760 years from 1970)')
}
