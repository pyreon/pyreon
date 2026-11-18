/** RFC 5545 text: `parseRRule`, `tryParseRRule` and `toRRule`. */
import { isTimeZone, toInstant, toPlainDateTime } from '@pyreon/time/core'
import type { PlainDate, PlainDateTime, TimeZone, Weekday } from '@pyreon/time/core'
import { readWall } from './civil'
import { badRange, badValue, guard, show } from './errors'
import { compile } from './plan'
import type { PlainValue, Recurrence, RecurrenceParts, WeekdaySpec } from './types'

const FREQS = { YEARLY: 'year', MONTHLY: 'month', WEEKLY: 'week', DAILY: 'day', HOURLY: 'hour', MINUTELY: 'minute' } as const
const FREQ_NAMES = { year: 'YEARLY', month: 'MONTHLY', week: 'WEEKLY', day: 'DAILY', hour: 'HOURLY', minute: 'MINUTELY' } as const
const DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

/** What parseRRule accepts, in one line for error messages. */
const EXAMPLE = 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU'

function fail(text: string, pos: number, message: string): never {
  const shown = text.length > 80 ? `${text.slice(0, 77)}...` : text

  return badRange('parseRRule', `${message} (at position ${pos} of ${JSON.stringify(shown)}). Write a rule like "${EXAMPLE}".`)
}

interface Part {
  name: string
  value: string
  at: number
}

function digits(text: string, at: number, s: string, what: string): number {
  if (!/^[0-9]+$/.test(s)) fail(text, at, `${what} must be digits, got ${show(s)}`)

  return Number(s)
}

function intList(text: string, part: Part, lo: number, hi: number, signed: boolean): number[] {
  return part.value.split(',').map((s, i) => {
    const n = /^[+-]?[0-9]+$/.test(s) ? Number(s) : NaN
    const ok = Number.isInteger(n) && ((n >= lo && n <= hi) || (signed && n <= -lo && n >= -hi))

    return ok ? n : fail(text, part.at + part.name.length + 1 + i, `${part.name} entries must be whole numbers from ${lo} to ${hi}${signed ? ` or -${lo} to -${hi}` : ''}, got ${show(s)}`)
  })
}

function byDay(text: string, part: Part): WeekdaySpec[] {
  return part.value.split(',').map((entry) => {
    const m = /^([+-]?[0-9]{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/i.exec(entry)

    if (m === null) return fail(text, part.at + 6, `BYDAY entries are like "TU", "1MO" or "-1FR", got ${show(entry)}`)
    const weekday = (DAYS.indexOf(m[2]!.toUpperCase()) + 1) as Weekday

    return m[1] === undefined ? weekday : { weekday, nth: Number(m[1]) }
  })
}

/** `20261118` or `20261118T090000` or with a trailing `Z`, as a PlainDate or PlainDateTime. */
function dateValue(text: string, at: number, raw: string, zone: TimeZone | undefined): { value: PlainValue; utc: boolean } {
  const m = /^([0-9]{4})([0-9]{2})([0-9]{2})(?:T([0-9]{2})([0-9]{2})([0-9]{2})?(Z)?)?$/i.exec(raw)

  if (m === null) return fail(text, at, `a date is 20261118 or 20261118T090000 (a trailing Z means UTC), got ${show(raw)}`)
  const date = `${m[1]}-${m[2]}-${m[3]}` as PlainDate

  if (m[4] === undefined) {
    try {
      readWall('parseRRule', 'date', date)
    } catch {
      return fail(text, at, `${show(raw)} is not a real date`)
    }

    return { value: date, utc: false }
  }
  const wall = `${date}T${m[4]}:${m[5]}${m[6] === undefined || m[6] === '00' ? '' : `:${m[6]}`}` as PlainDateTime
  const utc = m[7] !== undefined

  try {
    readWall('parseRRule', 'date', wall)
  } catch {
    return fail(text, at, `${show(raw)} is not a real date and time`)
  }
  if (!utc || zone === undefined || zone === 'UTC') return { value: wall, utc }

  return { value: toPlainDateTime(toInstant(wall, 'UTC'), zone), utc }
}

function parseParts(text: string, body: string, offset: number): Part[] {
  const parts: Part[] = []
  let at = offset

  for (const piece of body.split(';')) {
    const eq = piece.indexOf('=')

    if (piece === '') {
      at += 1
      continue
    }
    if (eq < 1) return fail(text, at, `expected NAME=value, got ${show(piece)}`)
    const name = piece.slice(0, eq).toUpperCase()

    if (parts.some((p) => p.name === name)) return fail(text, at, `${name} appears twice`)
    parts.push({ name, value: piece.slice(eq + 1), at })
    at += piece.length + 1
  }

  return parts
}

function ruleFrom(text: string, parts: Part[], start: PlainValue, zone: TimeZone | undefined): Recurrence {
  const freqPart = parts.find((p) => p.name === 'FREQ')

  if (freqPart === undefined) return fail(text, 0, 'FREQ is missing')
  const every = FREQS[freqPart.value.toUpperCase() as keyof typeof FREQS]

  if (every === undefined) {
    return fail(text, freqPart.at + 5, `FREQ must be YEARLY, MONTHLY, WEEKLY, DAILY, HOURLY or MINUTELY, got ${show(freqPart.value)}${/^SECONDLY$/i.test(freqPart.value) ? ' (SECONDLY is not supported)' : ''}`)
  }
  const rule: { -readonly [K in keyof Recurrence]: Recurrence[K] } = { every, start }
  const on: { -readonly [K in keyof RecurrenceParts]: RecurrenceParts[K] } = {}

  for (const p of parts) {
    const n = p.name

    if (n === 'FREQ') continue
    else if (n === 'INTERVAL') rule.interval = digits(text, p.at + 9, p.value, 'INTERVAL')
    else if (n === 'COUNT') rule.count = digits(text, p.at + 6, p.value, 'COUNT')
    else if (n === 'UNTIL') rule.until = dateValue(text, p.at + 6, p.value, zone).value
    else if (n === 'WKST') rule.weekStart = (DAYS.indexOf(p.value.toUpperCase()) + 1 || fail(text, p.at + 5, `WKST must be MO..SU, got ${show(p.value)}`)) as Weekday
    else if (n === 'BYDAY') on.weekdays = byDay(text, p)
    else if (n === 'BYMONTHDAY') on.monthDays = intList(text, p, 1, 31, true)
    else if (n === 'BYMONTH') on.months = intList(text, p, 1, 12, false)
    else if (n === 'BYYEARDAY') on.yearDays = intList(text, p, 1, 366, true)
    else if (n === 'BYWEEKNO') on.weeks = intList(text, p, 1, 53, true)
    else if (n === 'BYHOUR') on.hours = intList(text, p, 0, 23, false)
    else if (n === 'BYMINUTE') on.minutes = intList(text, p, 0, 59, false)
    else if (n === 'BYSETPOS') on.position = intList(text, p, 1, 366, true)
    else if (n === 'BYSECOND' || n === 'BYEASTER') return fail(text, p.at, `${n} is not supported`)
    else return fail(text, p.at, `unknown rule part ${show(n)}`)
  }
  if (Object.keys(on).length > 0) rule.on = on
  if (zone !== undefined) rule.timeZone = zone

  return rule
}

interface Line {
  name: string
  params: Record<string, string>
  value: string
  at: number
}

/** Unfold, then split `NAME;PARAM=x:value` lines. A bare `FREQ=...` text is one RRULE line. */
function linesOf(text: string): Line[] {
  const lines: Line[] = []
  let at = 0

  for (const raw of text.split(/\r?\n/)) {
    const here = at

    at += raw.length + 1
    if (raw.trim() === '') continue
    if (/^[ \t]/.test(raw) && lines.length > 0) {
      lines[lines.length - 1]!.value += raw.slice(1)
      continue
    }
    const trimmed = raw.trim()

    if (/^FREQ=/i.test(trimmed)) {
      lines.push({ name: 'RRULE', params: {}, value: trimmed, at: here + raw.indexOf(trimmed) })
      continue
    }
    const colon = raw.indexOf(':')

    if (colon < 1) return fail(text, here, `expected a line like "RRULE:${EXAMPLE}", got ${show(raw)}`)
    const [name, ...paramTexts] = raw.slice(0, colon).split(';')
    const params: Record<string, string> = {}

    for (const pt of paramTexts) {
      const eq = pt.indexOf('=')

      if (eq > 0) params[pt.slice(0, eq).toUpperCase()] = pt.slice(eq + 1)
    }
    lines.push({ name: name!.toUpperCase(), params, value: raw.slice(colon + 1), at: here + colon + 1 })
  }

  return lines
}

function zoneOf(text: string, line: Line, fallback: TimeZone | undefined): TimeZone | undefined {
  const tz = line.params.TZID

  if (tz === undefined) return fallback
  if (!isTimeZone(tz)) return fail(text, line.at, `unknown time zone ${show(tz)}`)

  return tz
}

function dateList(text: string, line: Line, zone: TimeZone | undefined): PlainValue[] {
  return line.value.split(',').filter((s) => s !== '').map((s) => dateValue(text, line.at, s.trim(), zone).value)
}

/**
 * Parse RFC 5545 text into a `Recurrence`: a bare rule (`FREQ=WEEKLY;INTERVAL=2;BYDAY=TU`), `RRULE:...`, or a block with
 * `DTSTART`, `RRULE`, `EXDATE` and `RDATE` lines (`DTSTART;TZID=Europe/Prague:20261118T090000`, `DTSTART;VALUE=DATE:20261118`).
 * `options.start` and `options.timeZone` fill in what the text leaves out. A UTC `UNTIL` or `EXDATE` (trailing `Z`) is read in
 * the rule's zone. `SECONDLY`, `BYSECOND` and `BYEASTER` are not supported. Malformed text throws a `[Pyreon]` RangeError that
 * says where; see `tryParseRRule` for a `null` instead.
 *
 * @example parseRRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU', { start: '2026-11-17' }) // => { every: 'week', start: '2026-11-17', interval: 2, on: { weekdays: [2] } }
 * @example parseRRule('DTSTART:20261118T090000\nRRULE:FREQ=DAILY;COUNT=3').start // => '2026-11-18T09:00'
 */
export const parseRRule = guard('parseRRule', function parseRRule(text: string, options?: { start?: PlainValue; timeZone?: TimeZone }): Recurrence {
  if (typeof text !== 'string') return badValue('parseRRule', 'RRULE text', text, `Pass a string like "${EXAMPLE}".`)
  const lines = linesOf(text)
  const rules = lines.filter((l) => l.name === 'RRULE')
  const dt = lines.find((l) => l.name === 'DTSTART')
  const unknown = lines.find((l) => !['RRULE', 'DTSTART', 'EXDATE', 'RDATE'].includes(l.name))

  if (unknown !== undefined) return fail(text, unknown.at, `${unknown.name} is not supported; use DTSTART, RRULE, EXDATE and RDATE`)
  if (rules.length !== 1) return fail(text, 0, rules.length === 0 ? 'there is no RRULE' : 'only one RRULE is supported')
  let zone = options?.timeZone
  let start = options?.start

  if (dt !== undefined) {
    zone = zoneOf(text, dt, zone)
    const parsed = dateValue(text, dt.at, dt.value.trim(), zone)

    start = parsed.value
    if (parsed.utc && zone === undefined) zone = 'UTC'
  }
  if (start === undefined) return fail(text, 0, 'there is no DTSTART and no options.start')
  const rule = ruleFrom(text, parseParts(text, rules[0]!.value.replace(/^RRULE:/i, ''), rules[0]!.at), start, zone)
  const except = lines.filter((l) => l.name === 'EXDATE').flatMap((l) => dateList(text, l, zoneOf(text, l, zone)))
  const also = lines.filter((l) => l.name === 'RDATE').flatMap((l) => dateList(text, l, zoneOf(text, l, zone)))

  if (except.length > 0) rule.except = except
  if (also.length > 0) rule.also = also
  compile('parseRRule', rule)

  return rule
})

/**
 * Like `parseRRule`, but `null` for text that is not a valid rule, with no exception: for user input.
 *
 * @example tryParseRRule('FREQ=SOMETIMES', { start: '2026-11-18' }) // => null
 */
export const tryParseRRule = guard('tryParseRRule', function tryParseRRule(text: string, options?: { start?: PlainValue; timeZone?: TimeZone }): Recurrence | null {
  try {
    return parseRRule(text, options)
  } catch (error) {
    if ((error instanceof TypeError || error instanceof RangeError) && error.message.startsWith('[Pyreon]')) return null
    throw error
  }
})

const pad = (n: number, w = 2): string => String(n).padStart(w, '0')

function ical(value: PlainValue, zone: TimeZone | undefined, utc: boolean): string {
  const r = readWall('toRRule', 'date', value)
  const compact = (value as string).replace(/[-:]/g, '')

  if (r.dateOnly) return compact
  if (r.wall % 1000 !== 0) return badRange('toRRule', `${show(value)} has milliseconds, which RFC 5545 cannot express.`)
  const time = compact.includes('T') ? compact.slice(0, compact.indexOf('T') + 7).padEnd(compact.indexOf('T') + 7, '0') : compact

  if (!utc) return time
  const t = toInstant(value as PlainDateTime, zone ?? 'UTC')
  const d = new Date(t)

  return `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

function weekdayText(w: WeekdaySpec): string {
  return typeof w === 'number' ? DAYS[w - 1]! : `${w.nth}${DAYS[w.weekday - 1]!}`
}

function rulePart(name: string, list: readonly (number | string)[] | undefined): string[] {
  return list === undefined ? [] : [`${name}=${list.join(',')}`]
}

function dateLine(name: string, values: readonly PlainValue[], zone: TimeZone | undefined): string[] {
  const dates = values.filter((v) => readWall('toRRule', name, v).dateOnly)
  const times = values.filter((v) => !readWall('toRRule', name, v).dateOnly)
  const out: string[] = []

  if (dates.length > 0) out.push(`${name};VALUE=DATE:${dates.map((v) => ical(v, zone, false)).join(',')}`)
  if (times.length > 0) out.push(`${name}${zone === undefined || zone === 'UTC' ? '' : `;TZID=${zone}`}:${times.map((v) => ical(v, zone, zone === 'UTC')).join(',')}`)

  return out
}

/**
 * Write a rule as RFC 5545 text: a `DTSTART` line (with `TZID` when the rule has a zone), an `RRULE` line, and `EXDATE` and
 * `RDATE` lines when needed. `parseRRule(toRRule(rule))` is the same rule, and writing that again gives the same text. A
 * `until` in a zone is written in UTC with a `Z`, as the RFC asks.
 *
 * @example toRRule({ every: 'week', interval: 2, on: { weekdays: [2] }, start: '2026-11-17' }) // => 'DTSTART;VALUE=DATE:20261117\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU'
 */
export const toRRule = guard('toRRule', function toRRule(rule: Recurrence): string {
  compile('toRRule', rule)
  const zone = rule.timeZone
  const dateOnlyStart = readWall('toRRule', 'start', rule.start).dateOnly
  const lines: string[] = []

  if (dateOnlyStart) lines.push(`DTSTART;VALUE=DATE:${ical(rule.start, zone, false)}`)
  else if (zone === undefined) lines.push(`DTSTART:${ical(rule.start, zone, false)}`)
  else lines.push(zone === 'UTC' ? `DTSTART:${ical(rule.start, zone, true)}` : `DTSTART;TZID=${zone}:${ical(rule.start, zone, false)}`)
  const on = rule.on
  const parts = [`FREQ=${FREQ_NAMES[rule.every]}`]

  if (rule.interval !== undefined && rule.interval !== 1) parts.push(`INTERVAL=${rule.interval}`)
  if (rule.count !== undefined) parts.push(`COUNT=${rule.count}`)
  if (rule.until !== undefined) parts.push(`UNTIL=${ical(rule.until, zone, zone !== undefined && !readWall('toRRule', 'until', rule.until).dateOnly && !dateOnlyStart)}`)
  if (rule.weekStart !== undefined && rule.weekStart !== 1) parts.push(`WKST=${DAYS[rule.weekStart - 1]}`)
  parts.push(...rulePart('BYMONTH', on?.months), ...rulePart('BYWEEKNO', on?.weeks), ...rulePart('BYYEARDAY', on?.yearDays), ...rulePart('BYMONTHDAY', on?.monthDays))
  if (on?.weekdays !== undefined) parts.push(`BYDAY=${on.weekdays.map(weekdayText).join(',')}`)
  parts.push(...rulePart('BYHOUR', on?.hours), ...rulePart('BYMINUTE', on?.minutes), ...rulePart('BYSETPOS', on?.position))
  lines.push(`RRULE:${parts.join(';')}`)
  if (rule.except !== undefined) lines.push(...dateLine('EXDATE', rule.except, zone))
  if (rule.also !== undefined) lines.push(...dateLine('RDATE', rule.also, zone))

  return lines.join('\n')
})
