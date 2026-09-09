// Accessibility.
//
// A canvas is one opaque node to a screen reader: without this, every chart in
// the library is a blank rectangle to anyone not looking at it. Most charting
// libraries treat this as an add-on; it is cheap to do properly when the engine
// already holds the data, and it is the difference between a chart being
// readable by everyone and readable by some.
//
// Two surfaces, because they answer different questions: a SUMMARY for "what
// does this show", and a TABLE for "what are the numbers".

import { plain } from './format'
import type { Formatter } from './format'
import { isFiniteNumber } from './scale'
import type { Double } from './types'

export interface A11ySeries {
  label: string
  values: Double[]
  kind: string
  /**
   * The series' SECOND channel, where it has one — a `band`'s low edge.
   *
   * Without it a band is described by its high edge alone, so the reader who
   * cannot see the fill is told "rising from 3 to 6" about a confidence
   * interval and never learns what it is an interval OF. A one-channel series
   * leaves it unset and every sentence below is unchanged.
   */
  values2?: Double[] | undefined
  /**
   * Error-bar bounds, where the series has them.
   *
   * Unlike `values2` these DECORATE a datum rather than replace it — the
   * series still has one value per category — so they read as a parenthesis
   * on the number rather than as a second column. Omitting them left the
   * table silent about uncertainty a sighted reader can see drawn.
   */
  errLow?: Double[] | undefined
  errHigh?: Double[] | undefined
  /**
   * The bubble channel's RAW values, where the series has them.
   *
   * A bubble encodes a third variable in its AREA, which is the one channel a
   * reader who cannot see the chart has no way to recover — so it reads as a
   * second cell, like the value it sits beside.
   */
  rValues?: Double[] | undefined
}

export interface A11yInput {
  title?: string | undefined
  categories: string[]
  series: A11ySeries[]
  format?: Formatter | undefined
}

/**
 * A one-paragraph description: what is plotted, over what, and how it moves.
 *
 * Direction and range are stated because they are what a sighted reader takes
 * from the shape in a glance, and they are exactly what is lost when the shape
 * is unavailable. Reading out every datum instead would bury that.
 */
export function describeChart(input: A11yInput): string {
  const fmt = input.format ?? plain
  const parts: string[] = []
  const title = input.title ?? 'Chart'

  if (input.series.length === 0) {
    return `${title}: no data.`
  }

  parts.push(`${title}.`)
  const n = input.series.length
  parts.push(n === 1 ? '1 series' : `${n} series`)
  if (input.categories.length > 0) {
    parts.push(`over ${input.categories.length} categories from ${input.categories[0]!} to ${input.categories[input.categories.length - 1]!}.`)
  } else {
    parts.push('.')
  }

  for (const s of input.series) {
    if (s.values.length === 0) {
      parts.push(`${s.label}: empty.`)
      continue
    }
    // GAPS are skipped, not narrated. The scan used to start at `values[0]`
    // and compare with `<` / `>`, and a NaN loses both comparisons — so a
    // series whose first points are gaps (every rolling indicator: the
    // leading `window - 1` have no average yet) described itself as
    // "flat from NaN to 60, ranging NaN at Mon". The table already treats a
    // gap as an empty cell; this is the same rule for the sentence.
    let lo = 0.0
    let hi = 0.0
    let loAt = 0
    let hiAt = 0
    let first = 0.0
    let last = 0.0
    let seen = 0
    for (let i = 0; i < s.values.length; i++) {
      const v = s.values[i]!
      // A NaN is the only value not equal to itself — the engine's gap test.
      if (v !== v) continue
      if (seen === 0) {
        lo = v
        hi = v
        loAt = i
        hiAt = i
        first = v
      }
      if (v < lo) { lo = v; loAt = i }
      if (v > hi) { hi = v; hiAt = i }
      last = v
      seen = seen + 1
    }
    if (seen === 0) {
      // Present but entirely gaps — a rolling window shorter than its own
      // period, say. "Empty" is the honest word and it is already this
      // function's word for nothing to describe.
      parts.push(`${s.label}: empty.`)
      continue
    }
    const dir = last > first ? 'rising' : last < first ? 'falling' : 'flat'
    const at = (i: number): string =>
      input.categories[i] !== undefined ? ` at ${input.categories[i]!}` : ''
    // A two-channel series names the channel it is describing and adds the
    // other one's span, so the interval is stated rather than implied.
    // `?? []` rather than an `!== undefined` guard: PMTC does not carry that
    // narrowing into Swift, so `other.count` there is a `[Double]?` and the
    // emitted engine does not compile. A defaulted non-optional local lowers
    // cleanly and reads the same.
    const other: Double[] = s.values2 ?? []
    if (other.length > 0) {
      // Gaps skipped here too — a band's lower edge is a rolling window as
      // often as its upper one is.
      let olo = 0.0
      let ohi = 0.0
      let oseen = 0
      for (let i = 0; i < other.length; i++) {
        const v = other[i]!
        if (v !== v) continue
        if (oseen === 0) {
          olo = v
          ohi = v
        }
        if (v < olo) olo = v
        if (v > ohi) ohi = v
        oseen = oseen + 1
      }
      if (oseen > 0) {
        parts.push(
          `${s.label}, ${s.kind}: upper bound ${dir} from ${fmt(first)} to ${fmt(last)}, ` +
            `ranging ${fmt(lo)}${at(loAt)} to ${fmt(hi)}${at(hiAt)}; ` +
            `lower bound ranging ${fmt(olo)} to ${fmt(ohi)}.`,
        )
        continue
      }
    }
    parts.push(
      `${s.label}, ${s.kind}: ${dir} from ${fmt(first)} to ${fmt(last)}, ` +
        `ranging ${fmt(lo)}${at(loAt)} to ${fmt(hi)}${at(hiAt)}.`,
    )
  }
  return parts.join(' ').replace(' .', '.')
}

export interface A11yTable {
  headers: string[]
  rows: string[][]
}

/**
 * The same data as a table, for a reader who wants the numbers.
 *
 * Rendered as a real `<table>` offscreen rather than an `aria-label`: a label
 * is read as one long unstructured string, while a table lets a screen reader
 * navigate by row and column the way it would any other tabular data.
 */
/**
 * A cell's number, with its whisker in parentheses when it has one.
 *
 * `3 (2 to 4)` rather than two more columns: an error bar is a bound ON a
 * value, so splitting it out would suggest three independent series where
 * there is one. A band is the opposite case and does get two columns.
 */
function withError(fmt: Formatter, v: Double, s: A11ySeries, i: number): string {
  const lo: Double[] = s.errLow ?? []
  const hi: Double[] = s.errHigh ?? []
  if (i >= lo.length || i >= hi.length) return fmt(v)
  const l = lo[i]!
  const h = hi[i]!
  if (l !== l || h !== h) return fmt(v)
  return `${fmt(v)} (${fmt(l)} to ${fmt(h)})`
}

export function chartTable(input: A11yInput): A11yTable {
  const fmt = input.format ?? plain
  // A two-channel series gets two COLUMNS. One column holding only the high
  // edge would hand the reader half a band and no way to tell that is what
  // happened; the table exists for the reader who wants the numbers, and a
  // band's numbers come in pairs.
  const headers = ['Category']
  for (const s of input.series) {
    const other: Double[] = s.values2 ?? []
    const rs: Double[] = s.rValues ?? []
    // Independent columns, not a chain: a series carrying BOTH a second
    // bound and a size channel must contribute both, and an `else if` here
    // silently dropped the size for any series that also had bounds.
    if (other.length > 0) {
      headers.push(`${s.label} (upper)`)
      headers.push(`${s.label} (lower)`)
    } else {
      headers.push(s.label)
    }
    if (rs.length > 0) headers.push(`${s.label} (size)`)
  }

  let n = input.categories.length
  for (const s of input.series) if (s.values.length > n) n = s.values.length

  const rows: string[][] = []
  for (let i = 0; i < n; i++) {
    // Bounds-checked, not coalesced: a subscript past the end is a crash on
    // Swift, not an `undefined` — and a series may be longer than the
    // categories (or shorter than its siblings).
    const row: string[] = [i < input.categories.length ? input.categories[i]! : `${i + 1}`]
    for (const s of input.series) {
      const other: Double[] = s.values2 ?? []
      const rs: Double[] = s.rValues ?? []
      const two = other.length > 0
      const sized = rs.length > 0
      if (i >= s.values.length) {
        row.push('')
        if (two) row.push('')
        if (sized) row.push('')
        continue
      }
      const v = s.values[i]!
      // A gap is an empty cell, not the word NaN — and an infinity is a gap
      // too, because the geometry drops it (`isFiniteNumber`).
      row.push(isFiniteNumber(v) ? withError(fmt, v, s, i) : '')
      if (two) {
        if (i >= other.length) row.push('')
        else {
          const v2 = other[i]!
          row.push(isFiniteNumber(v2) ? fmt(v2) : '')
        }
      }
      if (sized) {
        if (i >= rs.length) row.push('')
        else {
          const r = rs[i]!
          row.push(isFiniteNumber(r) ? fmt(r) : '')
        }
      }
    }
    rows.push(row)
  }
  return { headers, rows }
}
