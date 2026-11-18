/**
 * `parseNumber` and `parseDate`: the inverse of the formatters, driven by what
 * `Intl` itself emits for the locale (a probe format, cached per locale and
 * bounded), plus the common typed variants.
 *
 * parseNumber accepts the locale's digits (and Arabic-Indic, Extended
 * Arabic-Indic, Devanagari and fullwidth digits), the locale's decimal, group,
 * minus and percent signs, plain / no-break / narrow-no-break / thin spaces as
 * group separators where the locale groups with a space, and `'` for locales
 * that group with an apostrophe. Grouping must be well formed (a first group of
 * 1-3 digits, the rest 3, or 2 for locales that group in 2s after the first 3);
 * `1.5` in a locale whose group separator is `.` is rejected, never guessed.
 * Scientific notation is not parsed.
 *
 * parseDate reads a NUMERIC date: three digit runs in the locale's
 * day / month / year order, any separator characters the locale's own short
 * date uses (plus `. / - space`), or ISO `YYYY-MM-DD` in any locale. A
 * two-digit year follows the POSIX `%y` rule: 00-68 is 2000-2068, 69-99 is
 * 1969-1999 (in Buddhist and Minguo calendars a two-digit year continues the current century of the era). Buddhist and Minguo calendars are converted; other non-Gregorian
 * default calendars (Persian, Islamic, ...) return null. Month names are not parsed.
 */
import { daysInMonth } from './input'
import type { ParseOptions, PlainDateString } from './types'

const SYMBOL_CAP = 64

interface Symbols {
  /** Locale digits 0-9 (may be empty for latn). */
  digits: string[]
  decimal: string
  group: string
  minus: string
  percent: string
  /** Group sizes: primary (always 3 here) and the secondary size (2 in Indian grouping). */
  secondary: number
  /** Date field order, e.g. ['day','month','year'], and the separator characters its short date uses. */
  order: ('day' | 'month' | 'year')[]
  dateChars: string
  yearOffset: number
  supportedCalendar: boolean
}

let cache: Map<string, Symbols> | undefined

function strip(s: string): string {
  return s.replace(/[‎‏؜]/g, '')
}

function probe(locale: string): Symbols {
  const loc = locale === '' ? undefined : locale
  const nf = new Intl.NumberFormat(loc, { useGrouping: true, maximumFractionDigits: 1 })
  const parts = nf.formatToParts(-1234567.5)
  let decimal = '.'
  let group = ','
  let minus = '-'
  for (const p of parts) {
    if (p.type === 'decimal') decimal = p.value
    else if (p.type === 'group') group = p.value
    else if (p.type === 'minusSign') minus = strip(p.value)
  }
  const digitsFmt = new Intl.NumberFormat(loc, { useGrouping: false }).format(9876543210)
  const digits = Array.from(digitsFmt).reverse()
  const percentPart = new Intl.NumberFormat(loc, { style: 'percent' }).formatToParts(0.5).find((p) => p.type === 'percentSign')
  // Secondary group size: "12,34,567" groups the second group in 2s.
  const indian = new Intl.NumberFormat(loc).formatToParts(12345678)
  const groups = indian.filter((p) => p.type === 'integer')
  const secondary = groups.length > 2 && (groups[1]?.value.length ?? 3) === 2 ? 2 : 3
  const dtf = new Intl.DateTimeFormat(loc, { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' })
  const order: Symbols['order'] = []
  let dateChars = ''
  for (const p of dtf.formatToParts(Date.UTC(2026, 10, 18))) {
    const type: string = p.type
    if (type === 'day' || type === 'month' || type === 'year') order.push(type)
    else if (type === 'literal') dateChars += strip(p.value)
    else if (type === 'relatedYear' || type === 'yearName') order.length = 0
  }
  const calendar = dtf.resolvedOptions().calendar
  return {
    digits: digits.length === 10 ? digits : [],
    decimal: strip(decimal),
    group,
    minus,
    percent: strip(percentPart?.value ?? '%'),
    secondary,
    order: order.length === 3 ? order : ['year', 'month', 'day'],
    dateChars,
    yearOffset: calendar === 'buddhist' ? -543 : calendar === 'roc' ? 1911 : 0,
    supportedCalendar: calendar === 'gregory' || calendar === 'buddhist' || calendar === 'roc' || calendar === 'iso8601',
  }
}

function symbols(locale: string): Symbols {
  cache ??= new Map()
  let s = cache.get(locale)
  if (s === undefined) {
    if (cache.size >= SYMBOL_CAP) cache.delete(cache.keys().next().value as string)
    try {
      s = probe(locale)
    } catch {
      // An invalid tag: fall back to the runtime default, like the formatters.
      s = locale === '' ? probe('en-US') : symbols('')
    }
    cache.set(locale, s)
  }
  return s
}

/** Test hook. */
export function _clearParseCache(): { size: number } {
  const size = cache?.size ?? 0
  cache = undefined
  return { size }
}

export function _parseCacheSize(): number {
  return cache?.size ?? 0
}

/** One character to its ASCII digit value (0-9) or -1. */
function digitValue(ch: string, s: Symbols): number {
  const c = ch.charCodeAt(0)
  if (c >= 48 && c <= 57) return c - 48
  if (c >= 0x660 && c <= 0x669) return c - 0x660
  if (c >= 0x6f0 && c <= 0x6f9) return c - 0x6f0
  if (c >= 0x966 && c <= 0x96f) return c - 0x966
  if (c >= 0xff10 && c <= 0xff19) return c - 0xff10
  if (s.digits.length === 10) return s.digits.indexOf(ch)
  return -1
}

const SPACES = '     '

/** The characters accepted as group separators for a locale's group symbol. */
function groupChars(group: string): string {
  if (group === '' || SPACES.includes(group)) return SPACES
  if (group === '’' || group === "'") return "’'"
  return group
}

export function parseNumberIn(locale: string, text: unknown): number | null {
  if (typeof text !== 'string') return null
  const s = symbols(locale)
  const input = strip(text).trim()
  if (input === '') return null
  const groupSet = groupChars(s.group)
  const chars = Array.from(input)
  let end = chars.length
  let percent = false
  // A trailing percent sign (`%` or the locale's), possibly after a space.
  if (input.endsWith(s.percent) || chars[end - 1] === '%') {
    percent = true
    end -= chars[end - 1] === '%' ? 1 : Array.from(s.percent).length
    while (end > 0 && SPACES.includes(chars[end - 1] as string)) end--
  }
  let negative = false
  let signed = false
  let sawDecimal = false
  let frac = ''
  const intRuns: string[] = []
  let run = ''
  for (let i = 0; i < end; i++) {
    const ch = chars[i] as string
    const d = digitValue(ch, s)
    if (d >= 0) {
      if (sawDecimal) frac += d
      else run += d
    } else if (ch === s.decimal && !sawDecimal) {
      sawDecimal = true
    } else if (!sawDecimal && run === '' && intRuns.length === 0 && !signed && (ch === '-' || ch === '\u2212' || ch === s.minus || ch === '+')) {
      signed = true
      negative = ch !== '+'
    } else if (!sawDecimal && run === '' && intRuns.length === 0 && SPACES.includes(ch)) {
      // Space between the sign and the digits ("- 5"): allowed.
    } else if (!sawDecimal && run !== '' && groupSet.includes(ch)) {
      intRuns.push(run)
      run = ''
    } else {
      return null
    }
  }
  if (run !== '') intRuns.push(run)
  else if (intRuns.length > 0) return null // a trailing group separator
  if (intRuns.length === 0 && frac === '') return null
  if (sawDecimal && frac === '' && intRuns.length === 0) return null
  if (intRuns.length > 1) {
    const first = intRuns[0] as string
    if (first.length > 3) return null
    for (let k = 1; k < intRuns.length; k++) {
      const len = (intRuns[k] as string).length
      const last = k === intRuns.length - 1
      if (last ? len !== 3 : len !== 3 && len !== s.secondary) return null
    }
  }
  const n = Number(`${intRuns.join('') || '0'}${frac === '' ? '' : `.${frac}`}`)
  if (!Number.isFinite(n)) return null
  const v = negative ? -n : n
  return percent ? v / 100 : v
}

const CH_ASCII_ALLOWED = '. /-  '

export function parseDateIn(locale: string, text: unknown): PlainDateString | null {
  if (typeof text !== 'string') return null
  const s = symbols(locale)
  const input = strip(text).trim()
  if (input === '') return null
  const runs: string[] = []
  let current = ''
  for (const ch of input) {
    const d = digitValue(ch, s)
    if (d >= 0) {
      current += d
      continue
    }
    if (!(CH_ASCII_ALLOWED.includes(ch) || s.dateChars.includes(ch))) return null
    if (current !== '') {
      runs.push(current)
      current = ''
    }
  }
  if (current !== '') runs.push(current)
  if (runs.length !== 3) return null
  const [a, b, c] = runs as [string, string, string]
  if (a.length === 4 && b.length <= 2 && c.length <= 2 && s.order[0] !== 'year' && input.charCodeAt(4) === 45) {
    // ISO `2026-11-18` typed into a day-first or month-first locale.
    return finish(Number(a), Number(b), Number(c))
  }
  const byField = { year: '', month: '', day: '' }
  for (let k = 0; k < 3; k++) byField[s.order[k] as 'year' | 'month' | 'day'] = runs[k] as string
  if (byField.month.length > 2 || byField.day.length > 2) return null
  if (!s.supportedCalendar) return null
  const len = byField.year.length
  const n = Number(byField.year)
  let year: number
  if (s.yearOffset === 0) {
    if (len !== 2 && len !== 4) return null
    year = len === 2 ? n + (n <= 68 ? 2000 : 1900) : n
  } else {
    // Buddhist (BE = CE + 543) and Minguo (ROC = CE - 1911) years: a two-digit year
    // continues the era's current century (BE 25yy, ROC 1yy).
    if (len < 2 || len > 4) return null
    const local = len === 2 ? (s.yearOffset < 0 ? 2500 + n : 100 + n) : n
    year = local + s.yearOffset
  }
  return finish(year, Number(byField.month), Number(byField.day))
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0')
}

function finish(year: number, month: number, day: number): PlainDateString | null {
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}` as PlainDateString
}

export type { ParseOptions }
