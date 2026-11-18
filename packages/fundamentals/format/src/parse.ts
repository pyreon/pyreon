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
 * 1969-1999 (in Buddhist and Minguo calendars a two-digit year continues the
 * current century of the era). Buddhist and Minguo calendars are converted;
 * other non-Gregorian default calendars (Persian, Islamic, ...) return null.
 * Month names are not parsed.
 */
import { daysInMonth } from './input'
import type { PlainDateString } from './types'

const SYMBOL_CAP = 64

type Field = 'day' | 'month' | 'year'

interface NumberSymbols {
  /** Locale digits 0-9 (empty for latn). */
  digits: string[]
  decimal: string
  group: string
  minus: string
  percent: string
  /** Size of the groups after the first 3 digits: 2 in Indian grouping, else 3. */
  secondary: number
  /** A lone `.` is also a decimal separator: the locale's decimal is `,` and its group separator is not `.` (cs, fr, ru, pl). */
  altDot: boolean
}

interface DateSymbols {
  /** Field orders of the numeric, long-month and short-month forms (first is the numeric one), without repeats. */
  orders: Field[][]
  /** Words that appear as literals in the locale's own forms (`г`, `de`, `年`): ignored while parsing. */
  literalWords: ReadonlySet<string>
  /** Month name -> month index (0-11), built on first use. */
  months: Map<string, number> | undefined
  /** Added to a local era year to get the Gregorian one (Buddhist -543, Minguo +1911). */
  yearOffset: number
  supportedCalendar: boolean
}

type Symbols = NumberSymbols & DateSymbols

let cache: Map<string, Symbols> | undefined

function strip(s: string): string {
  return s.replace(/[‎‏؜]/g, '')
}

function probeNumbers(loc: string | undefined): NumberSymbols {
  const parts = new Intl.NumberFormat(loc, { maximumFractionDigits: 1 }).formatToParts(-1234567.5)
  let decimal = '.'
  let group = ','
  let minus = '-'
  for (const p of parts) {
    if (p.type === 'decimal') decimal = p.value
    else if (p.type === 'group') group = p.value
    else if (p.type === 'minusSign') minus = strip(p.value)
  }
  const digits = Array.from(new Intl.NumberFormat(loc, { useGrouping: false }).format(9876543210)).reverse()
  const percent = new Intl.NumberFormat(loc, { style: 'percent' })
    .formatToParts(0.5)
    .find((p) => p.type === 'percentSign')
  const groups = new Intl.NumberFormat(loc).formatToParts(12345678).filter((p) => p.type === 'integer')

  return {
    digits: digits.length === 10 ? digits : [],
    decimal: strip(decimal),
    group,
    minus,
    percent: strip(percent?.value ?? '%'),
    secondary: groups.length > 2 && groups[1]?.value.length === 2 ? 2 : 3,
    altDot: strip(decimal) === ',' && !groupChars(group).includes('.'),
  }
}

const YEAR_OFFSETS: Record<string, number | undefined> = { buddhist: -543, roc: 1911 }

/** Separators between words of a date: spaces, `/`, `,`, the Arabic comma, dashes. A `.` stays inside a word (`พ.ย.`, `lis.`). */
const WORD_SEPARATORS = /[\s/,\u060c\-\u2013]+/u

/** Lower-case word with the dots around it removed (`Lis.` -> `lis`). */
function normalizeWord(word: string): string {
  return strip(word).replace(/^\.+|\.+$/gu, '').toLowerCase()
}

function wordsOf(text: string): string[] {
  return text.split(WORD_SEPARATORS).map(normalizeWord).filter((w) => w !== '')
}

function probeDates(loc: string | undefined): DateSymbols {
  const orders: Field[][] = []
  const literalWords = new Set<string>()
  let calendar = 'gregory'
  for (const month of ['numeric', 'long', 'short'] as const) {
    const dtf = new Intl.DateTimeFormat(loc, { year: 'numeric', month, day: 'numeric', timeZone: 'UTC' })
    if (month === 'numeric') calendar = dtf.resolvedOptions().calendar
    const order: Field[] = []
    for (const p of dtf.formatToParts(Date.UTC(2026, 10, 18))) {
      const type: string = p.type
      if (type === 'day' || type === 'month' || type === 'year') order.push(type)
      else if (type === 'relatedYear' || type === 'yearName') order.length = 0
      else if (type === 'literal') for (const w of wordsOf(p.value)) literalWords.add(w)
      // A month part such as `11월` carries its own suffix word.
      if (type === 'month' && /\p{Nd}/u.test(p.value)) for (const w of wordsOf(p.value.replace(/\p{Nd}+/gu, ' '))) literalWords.add(w)
    }
    if (order.length === 3 && !orders.some((o) => o.join() === order.join())) orders.push(order)
  }

  return {
    orders: orders.length > 0 ? orders : [['year', 'month', 'day']],
    literalWords,
    months: undefined,
    yearOffset: YEAR_OFFSETS[calendar] ?? 0,
    supportedCalendar: ['gregory', 'buddhist', 'roc', 'iso8601'].includes(calendar),
  }
}

/** Month names (long and short, standalone and with a day, so genitive forms are included) the locale writes; ambiguous ones are dropped. */
function monthNames(s: Symbols, locale: string): Map<string, number> {
  if (s.months !== undefined) return s.months
  // A locale Intl rejects falls back to the runtime default, like the symbol probes do.
  let loc: string | undefined = locale === '' ? undefined : locale
  try {
    Intl.DateTimeFormat.supportedLocalesOf(loc === undefined ? [] : [loc])
  } catch {
    loc = undefined
  }
  const names = new Map<string, number>()
  const ambiguous = new Set<string>()
  for (const form of [{ month: 'long' }, { day: 'numeric', month: 'long' }, { month: 'short' }, { day: 'numeric', month: 'short' }] as const) {
    const dtf = new Intl.DateTimeFormat(loc, { ...form, timeZone: 'UTC' })
    for (let m = 0; m < 12; m++) {
      const value = dtf.formatToParts(Date.UTC(2026, m, 15)).find((p) => p.type === 'month')?.value
      const word = value === undefined ? '' : normalizeWord(value)
      if (word === '' || /\p{Nd}/u.test(word)) continue
      if (names.has(word) && names.get(word) !== m) ambiguous.add(word)
      else names.set(word, m)
    }
  }
  for (const word of ambiguous) names.delete(word)
  s.months = names

  return names
}

function probe(locale: string): Symbols {
  const loc = locale === '' ? undefined : locale
  return { ...probeNumbers(loc), ...probeDates(loc) }
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

/** Test hooks. */
export function _clearParseCache(): void {
  cache = undefined
  currencyCache.clear()
}

export function _parseCacheSize(): number {
  return cache?.size ?? 0
}

/** One character to its digit value (0-9) or -1. */
function digitValue(ch: string, s: NumberSymbols): number {
  const c = ch.charCodeAt(0)
  if (c >= 48 && c <= 57) return c - 48
  if (c >= 0x660 && c <= 0x669) return c - 0x660
  if (c >= 0x6f0 && c <= 0x6f9) return c - 0x6f0
  if (c >= 0x966 && c <= 0x96f) return c - 0x966
  if (c >= 0xff10 && c <= 0xff19) return c - 0xff10

  return s.digits.length === 10 ? s.digits.indexOf(ch) : -1
}

const SPACES = '     '

/** The characters accepted as group separators for a locale's group symbol. */
function groupChars(group: string): string {
  if (group === '' || SPACES.includes(group)) return SPACES
  if (group === '’' || group === "'") return "’'"
  return group
}

// ─── parseNumber ─────────────────────────────────────────────────────────────

interface Scan {
  negative: boolean
  signed: boolean
  sawDecimal: boolean
  frac: string
  intRuns: string[]
  run: string
}

function isMinus(ch: string, s: NumberSymbols): boolean {
  return ch === '-' || ch === '−' || ch === s.minus || ch === '+'
}

/** Feed one character to the scan; `false` when it does not belong in a number. */
function step(st: Scan, ch: string, s: NumberSymbols, groupSet: string): boolean {
  const d = digitValue(ch, s)
  if (d >= 0) {
    if (st.sawDecimal) st.frac += d
    else st.run += d

    return true
  }
  const leading = !st.sawDecimal && st.run === '' && st.intRuns.length === 0
  if ((ch === s.decimal || (ch === '.' && s.altDot)) && !st.sawDecimal) {
    st.sawDecimal = true
    return true
  }
  if (leading && !st.signed && isMinus(ch, s)) {
    st.signed = true
    st.negative = ch !== '+'
    return true
  }
  // A space between the sign and the digits ("- 5").
  if (leading && SPACES.includes(ch)) return true
  if (!st.sawDecimal && st.run !== '' && groupSet.includes(ch)) {
    st.intRuns.push(st.run)
    st.run = ''
    return true
  }

  return false
}

/** Digit groups must be well formed: 1-3 digits, then 3 (or the locale's secondary size) each, the last exactly 3. */
function groupsAreValid(runs: string[], s: NumberSymbols): boolean {
  if (runs.length < 2) return true
  if ((runs[0] as string).length > 3) return false
  for (let k = 1; k < runs.length; k++) {
    const len = (runs[k] as string).length
    const ok = k === runs.length - 1 ? len === 3 : len === 3 || len === s.secondary
    if (!ok) return false
  }

  return true
}

/** The index where the number ends once a trailing percent sign (and the space before it) is removed. */
function numberEnd(input: string, chars: string[], s: NumberSymbols): { end: number; percent: boolean } {
  const last = chars[chars.length - 1]
  const isPercent = last === '%' || input.endsWith(s.percent)
  if (!isPercent) return { end: chars.length, percent: false }
  let end = chars.length - (last === '%' ? 1 : Array.from(s.percent).length)
  while (end > 0 && SPACES.includes(chars[end - 1] as string)) end--

  return { end, percent: true }
}

export function parseNumberIn(locale: string, text: unknown): number | null {
  if (typeof text !== 'string') return null
  const s = symbols(locale)
  const input = strip(text).trim()
  if (input === '') return null
  const chars = Array.from(input)
  const { end, percent } = numberEnd(input, chars, s)
  const groupSet = groupChars(s.group)
  const st: Scan = { negative: false, signed: false, sawDecimal: false, frac: '', intRuns: [], run: '' }
  for (let i = 0; i < end; i++) {
    if (!step(st, chars[i] as string, s, groupSet)) return null
  }
  if (st.run !== '') st.intRuns.push(st.run)
  else if (st.intRuns.length > 0) return null // a trailing group separator
  if (st.intRuns.length === 0 && st.frac === '') return null
  if (!groupsAreValid(st.intRuns, s)) return null
  const n = Number(`${st.intRuns.join('') || '0'}${st.frac === '' ? '' : `.${st.frac}`}`)
  if (!Number.isFinite(n)) return null
  const v = st.negative ? -n : n

  return percent ? v / 100 : v
}

// ─── parseDate ───────────────────────────────────────────────────────────────

/** A date split into its digit runs and its words (everything between digits that is not a separator or a dot). */
function scanDate(input: string, s: Symbols): { runs: string[]; words: string[] } {
  const runs: string[] = []
  const words: string[] = []
  let digits = ''
  let other = ''
  for (const ch of input) {
    const d = digitValue(ch, s)
    if (d >= 0) {
      for (const w of wordsOf(other)) words.push(w)
      other = ''
      digits += d
    } else {
      if (digits !== '') runs.push(digits)
      digits = ''
      other += ch
    }
  }
  if (digits !== '') runs.push(digits)
  for (const w of wordsOf(other)) words.push(w)

  return { runs, words }
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0')
}

function finish(year: number, month: number, day: number): PlainDateString | null {
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}` as PlainDateString
}

/** The Gregorian year for the year digits of a locale's date, or `null` when the shape is wrong. */
function gregorianYear(digits: string, s: DateSymbols): number | null {
  const len = digits.length
  const n = Number(digits)
  if (s.yearOffset === 0) {
    if (len !== 2 && len !== 4) return null
    if (len === 4) return n
    return n + (n <= 68 ? 2000 : 1900)
  }
  // Buddhist (BE = CE + 543) and Minguo (ROC = CE - 1911) years: a two-digit year
  // continues the era's current century (BE 25yy, ROC 1yy).
  if (len < 2 || len > 4) return null
  const century = s.yearOffset < 0 ? 2500 : 100

  return (len === 2 ? century + n : n) + s.yearOffset
}

/** Day, month and year from three digit runs in the given field order. */
function fromRuns(runs: string[], order: Field[], s: DateSymbols): PlainDateString | null {
  const byField: Record<Field, string> = { year: '', month: '', day: '' }
  for (let k = 0; k < 3; k++) byField[order[k] as Field] = runs[k] as string
  if (byField.month.length > 2 || byField.day.length > 2) return null
  const year = gregorianYear(byField.year, s)

  return year === null ? null : finish(year, Number(byField.month), Number(byField.day))
}

/** `18 Nov 2026`, `Nov 18, 2026`, `18. listopadu 2026`: one month name and two digit runs. */
function fromNamed(runs: string[], month: number, s: DateSymbols): PlainDateString | null {
  const [a, b] = runs as [string, string]
  let yearDigits: string
  let dayDigits: string
  if (a.length === 4 && b.length <= 2) [yearDigits, dayDigits] = [a, b]
  else if (b.length === 4 && a.length <= 2) [yearDigits, dayDigits] = [b, a]
  else {
    const order = s.orders[1] ?? s.orders[0] ?? []
    if (order.indexOf('day') < order.indexOf('year')) [dayDigits, yearDigits] = [a, b]
    else [yearDigits, dayDigits] = [a, b]
  }
  if (dayDigits.length > 2) return null
  const year = gregorianYear(yearDigits, s)

  return year === null ? null : finish(year, month + 1, Number(dayDigits))
}

/** A month name, also when the locale glues a literal word to it (Hebrew `ב` + `נוב׳` is written `בנוב׳`). */
function monthIndex(s: Symbols, locale: string, word: string): number | undefined {
  const names = monthNames(s, locale)
  const direct = names.get(word)
  if (direct !== undefined) return direct
  for (const literal of s.literalWords) {
    if (literal.length > 3) continue
    if (word.startsWith(literal)) {
      const rest = names.get(word.slice(literal.length))
      if (rest !== undefined) return rest
    }
    if (word.endsWith(literal)) {
      const rest = names.get(word.slice(0, word.length - literal.length))
      if (rest !== undefined) return rest
    }
  }

  return undefined
}

/** The month a date's words name (`-1` for none) and whether one of them is a literal of the locale's own forms; `null` for an unknown word. */
function readWords(words: string[], s: Symbols, locale: string): { month: number; literal: boolean } | null {
  let month = -1
  let literal = false
  for (const word of words) {
    if (s.literalWords.has(word)) {
      literal = true
      continue
    }
    const index = monthIndex(s, locale, word)
    if (index === undefined || month !== -1) return null
    month = index
  }

  return { month, literal }
}

/** Three digit runs: ISO typed into any locale, else the locale's field order (or the long form's, when literals are present). */
function fromThreeRuns(runs: string[], input: string, literal: boolean, s: Symbols): PlainDateString | null {
  const [a, b, c] = runs as [string, string, string]
  if (a.length === 4 && b.length <= 2 && c.length <= 2 && s.orders[0]?.[0] !== 'year' && input.charCodeAt(4) === 45) {
    // ISO `2026-11-18` typed into a day-first or month-first locale.
    return finish(Number(a), Number(b), Number(c))
  }
  if (!s.supportedCalendar) return null
  // Forms with words of their own (`2026年11月18日`) may follow the long form's order, not the numeric one.
  for (const order of literal ? s.orders : s.orders.slice(0, 1)) {
    const date = fromRuns(runs, order, s)
    if (date !== null) return date
  }

  return null
}

export function parseDateIn(locale: string, text: unknown): PlainDateString | null {
  if (typeof text !== 'string') return null
  const s = symbols(locale)
  const input = strip(text).trim()
  if (input === '') return null
  const { runs, words } = scanDate(input, s)
  const read = readWords(words, s, locale)
  if (read === null) return null
  if (read.month !== -1) return runs.length === 2 && s.supportedCalendar ? fromNamed(runs, read.month, s) : null

  return runs.length === 3 ? fromThreeRuns(runs, input, read.literal, s) : null
}

// ─── parseCurrency ───────────────────────────────────────────────────────────

const currencyCache = new Map<string, string[]>()

/** Every way the locale writes `currency` (symbol, narrow symbol, code, name), longest first. */
function currencyTokens(locale: string, currency: string): string[] {
  const key = `${locale}\u0000${currency}`
  let tokens = currencyCache.get(key)
  if (tokens === undefined) {
    const found = new Set<string>([currency.toUpperCase()])
    const collect = (loc: string | undefined) => {
      for (const currencyDisplay of ['symbol', 'narrowSymbol', 'code', 'name'] as const) {
        const nf = new Intl.NumberFormat(loc, { style: 'currency', currency, currencyDisplay })
        for (const v of [1, 2, 5, -1.5, 0.5]) {
          for (const p of nf.formatToParts(v)) if (p.type === 'currency') found.add(strip(p.value).trim())
        }
      }
    }
    try {
      collect(locale === '' ? undefined : locale)
    } catch {
      // An invalid locale reads with the runtime default; an invalid code leaves only the code itself to strip.
      try {
        collect(undefined)
      } catch {
        // nothing more to find
      }
    }
    tokens = [...found].filter((t) => t !== '').sort((x, y) => y.length - x.length)
    if (currencyCache.size >= SYMBOL_CAP) currencyCache.delete(currencyCache.keys().next().value as string)
    currencyCache.set(key, tokens)
  }

  return tokens
}

/** A money amount typed or printed for `currency`: its symbol, code or name (before or after the number) and accounting parentheses are removed, then the number is read. */
export function parseCurrencyIn(locale: string, text: unknown, currency: unknown): number | null {
  if (typeof text !== 'string' || typeof currency !== 'string' || currency === '') return null
  let input = strip(text).trim()
  let negative = false
  if (input.startsWith('(') && input.endsWith(')')) {
    negative = true
    input = input.slice(1, -1).trim()
  }
  const lower = input.toLowerCase()
  for (const token of currencyTokens(locale, currency)) {
    const at = lower.indexOf(token.toLowerCase())
    if (at === -1) continue
    input = `${input.slice(0, at)} ${input.slice(at + token.length)}`.trim()
    break
  }
  const n = parseNumberIn(locale, input)

  return n === null ? null : negative ? -Math.abs(n) : n
}
