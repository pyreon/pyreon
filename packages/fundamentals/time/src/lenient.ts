import { isPlainDate, isPlainDateTime, isPlainTime, isPlainYearMonth, normalize, pad2 } from './text'
import type { PlainDate, PlainDateTime, PlainTime, PlainYearMonth } from './types'

const DATE_TIME = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[Tt ]+(\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:[.,](\d{1,9}))?)?)?$/
const YEAR_MONTH = /^(\d{4})-(\d{1,2})$/
const TIME_ONLY = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:[.,](\d{1,9}))?)?$/
const INSTANT = /^(\d{4})-(\d{1,2})-(\d{1,2})[Tt ]+(\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:[.,](\d{1,9}))?)?\s*([Zz]|[+-]\d{2}(?::?\d{2})?)$/

/** `14`, `5`, `250` into `14:05:00.250` parts; the fraction keeps at most milliseconds. */
function clock(h: string, m: string, s: string | undefined, f: string | undefined): string {
  const base = `${pad2(Number(h))}:${pad2(Number(m))}`

  if (s === undefined) return base
  const withSeconds = `${base}:${pad2(Number(s))}`

  return f === undefined ? withSeconds : `${withSeconds}.${f.slice(0, 3).padEnd(3, '0')}`
}

/**
 * Read an ISO-like string that people and other systems really produce, and return the strict value it denotes, or `null`.
 * Accepts, beyond the strict forms: a space or lower-case `t` between date and time, unpadded months, days and hours
 * (`2026-2-3`), a comma as the decimal mark, up to nine fraction digits (cut to milliseconds), and surrounding spaces.
 * It never guesses a meaning: a string with an offset or `Z` is a moment, not a wall-clock value, so it is `null` here (use
 * `parseInstant(text, { lenient: true })`), and an impossible date such as `2026-02-30` is `null`. The strict `isPlain*`
 * guards stay strict; this is the one lenient door. The result is always in the canonical form (`normalize`). To read an offset
 * string as a wall-clock time in a zone, go through the instant: `toPlainDateTime(parseInstant(text), zone)`.
 *
 * @example parseISO('2026-11-18 14:30') // => '2026-11-18T14:30'
 * @example parseISO(' 2026-2-3 ') // => '2026-02-03'
 * @example parseISO('2026-11-18t14:30:05,5') // => '2026-11-18T14:30:05.500'
 * @example parseISO('2026-11-18T14:30Z') // => null
 * @example toPlainDateTime(parseInstant('2026-11-18T14:30:00+01:00')!, 'Asia/Tokyo') // => '2026-11-18T22:30'
 */
export function parseISO(text: string): PlainDate | PlainDateTime | PlainYearMonth | PlainTime | null {
  if (typeof text !== 'string') return null
  const t = text.trim()
  const dt = DATE_TIME.exec(t)

  if (dt !== null) {
    const date = `${dt[1]}-${pad2(Number(dt[2]))}-${pad2(Number(dt[3]))}`

    if (dt[4] === undefined) return isPlainDate(date) ? date : null
    const value = `${date}T${clock(dt[4], dt[5]!, dt[6], dt[7])}`

    return isPlainDateTime(value) ? normalize(value) : null
  }
  const ym = YEAR_MONTH.exec(t)

  if (ym !== null) {
    const value = `${ym[1]}-${pad2(Number(ym[2]))}`

    return isPlainYearMonth(value) ? value : null
  }
  const time = TIME_ONLY.exec(t)

  if (time === null) return null
  const value = clock(time[1]!, time[2]!, time[3], time[4])

  return isPlainTime(value) ? normalize(value) : null
}

/** The strict form of a lenient timestamp (`2026-11-18 14:30z`, `2026-11-18T14:30:05+0100`), or `null`. */
export function strictInstantText(text: string): string | null {
  const m = INSTANT.exec(text.trim())

  if (m === null) return null
  const fraction = m[7] === undefined ? '' : `.${m[7].slice(0, 9)}`
  let offset = m[8]!.toUpperCase()

  if (offset !== 'Z') {
    const digits = offset.slice(1).replace(':', '')

    offset = `${offset[0]}${digits.slice(0, 2)}:${digits.length > 2 ? digits.slice(2) : '00'}`
  }

  return `${m[1]}-${pad2(Number(m[2]))}-${pad2(Number(m[3]))}T${pad2(Number(m[4]))}:${m[5]}:${pad2(Number(m[6] ?? '0'))}${fraction}${offset}`
}
