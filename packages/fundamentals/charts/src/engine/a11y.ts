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

import { groupThousands } from './format'
import type { Formatter } from './format'
import { isFiniteNumber } from './scale'
import type { Double } from './types'

export interface A11ySeries {
  label: string
  values: readonly Double[]
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

/**
 * The words the accessible surfaces are built from, for an app that is not in
 * English. Every field is a template: `{name}` slots are filled in, and a
 * template may drop or reorder them (a language that does not name the mark
 * kind leaves `{kind}` out of `trend`). Unset fields keep the English below.
 *
 * Plural forms: `oneSeries` / `manySeries` cover languages with two forms;
 * for more, word `manySeries` so it reads for any count (`řady: {n}`).
 *
 * A plain struct of strings so the same value lowers to Swift and Kotlin: the
 * native chart hosts take the `messages` prop and their VoiceOver / TalkBack
 * description, data view and per-datum nodes read it through this engine.
 */
export interface ChartMessages {
  /** The name of a chart with no `title`. Default `Chart`. */
  untitled?: string | undefined
  /** `{title}`. Default `{title}: no data.` */
  noData?: string | undefined
  /** `{title}`, `{series}`, `{count}` categories, `{first}`, `{last}`. Default `{title}. {series} over {count} categories from {first} to {last}.` */
  overview?: string | undefined
  /** `{title}`, `{series}`: the overview of a chart with no categories. Default `{title}. {series}.` */
  overviewPlain?: string | undefined
  /** Default `1 series`. */
  oneSeries?: string | undefined
  /** `{n}`. Default `{n} series`. */
  manySeries?: string | undefined
  /** `{label}`. Default `{label}: empty.` */
  empty?: string | undefined
  /** Default `rising`. */
  rising?: string | undefined
  /** Default `falling`. */
  falling?: string | undefined
  /** Default `flat`. */
  flat?: string | undefined
  /** `{label}`, `{kind}`, `{direction}`, `{change}` (a leading space and `45%`, or empty), `{first}`, `{last}`, `{low}`, `{lowAt}`, `{high}`, `{highAt}`. Default `{label}, {kind}: {direction}{change} from {first} to {last}, ranging {low}{lowAt} to {high}{highAt}.` */
  trend?: string | undefined
  /** `trend`'s slots plus `{low2}` and `{high2}`, the lower edge's range: a band. Default `{label}, {kind}: upper bound {direction}{change} from {first} to {last}, ranging {low}{lowAt} to {high}{highAt}; lower bound ranging {low2} to {high2}.` */
  bandTrend?: string | undefined
  /** `{category}`: where a value sits, filling `{lowAt}` / `{highAt}` and `datum`'s `{at}`. Default ` at {category}`. */
  at?: string | undefined
  /** The accessible table's first header. Default `Category`. */
  category?: string | undefined
  /** `{label}`: a band's upper-edge column. Default `{label} (upper)`. */
  upper?: string | undefined
  /** `{label}`: a band's lower-edge column. Default `{label} (lower)`. */
  lower?: string | undefined
  /** `{label}`: a bubble series' size column. Default `{label} (size)`. */
  size?: string | undefined
  /** `{value}`, `{low}`, `{high}`: a value with its error bar. Default `{value} ({low} to {high})`. */
  withError?: string | undefined
  /** A gap, read by the keyboard walk. Default `no value`. */
  noValue?: string | undefined
  /** `{label}`, `{value}`, `{at}`, `{index}`, `{count}`: the datum the keyboard focus is on. Default `{label}: {value}{at}, {index} of {count}`. */
  datum?: string | undefined
  /** `{axis}`, `{scale}`: a non-linear axis, appended to the description. Default ` The {axis} axis is on a {scale} scale.` */
  scaleNote?: string | undefined
  /** The value axis's name in `scaleNote`. Default `value`. */
  valueAxis?: string | undefined
  /** The x axis's name in `scaleNote`. Default `x`. */
  xAxis?: string | undefined
  /** `{title}`, `{shown}`, `{total}`: the table caption when only the first rows are built. Default `{title} (first {shown} of {total} rows)`. */
  truncated?: string | undefined
  /** `{list}`: the selected items, appended to a family chart's description. Default ` Selected: {list}.` */
  selected?: string | undefined
  /** The data view's close button. Default `Close`. */
  close?: string | undefined
  /** `{title}`, `{value}`, `{max}`: `<GaugeChart>`'s description. Default `{title}: {value} of {max}.` */
  gauge?: string | undefined
  /** `{title}`, `{count}`, `{min}`, `{max}`, `{close}`: `<CandlestickChart>`'s description. Default `{title}: {count} periods, range {min} to {max}, last close {close}.` */
  candlestick?: string | undefined
  /** `{title}`, `{columns}`, `{rows}`, `{min}`, `{max}`: `<HeatmapChart>`'s description. Default `{title}: {columns} columns by {rows} rows, values {min} to {max}.` */
  heatmap?: string | undefined
}

export interface A11yInput {
  title?: string | undefined
  categories: readonly string[]
  series: A11ySeries[]
  format?: Formatter | undefined
  /** The words, when not English (`ChartMessages`). */
  messages?: ChartMessages | undefined
}

/** `template` with its `{key}` slot filled — the first one, which is the only one a message has. */
export function fillMessage(template: string, key: string, value: string): string {
  return template.replace(`{${key}}`, value)
}

/** `<GaugeChart>`'s description: `Speed: 72 of 100.` */
export function describeGauge(title: string, value: string, max: string, messages?: ChartMessages | undefined): string {
  const g1 = fillMessage(messages?.gauge ?? '{title}: {value} of {max}.', 'title', title)
  return fillMessage(fillMessage(g1, 'value', value), 'max', max)
}

/** What `describeCandles` says: the periods, the range and the last close, already formatted. */
export interface CandleSummary {
  title: string
  count: number
  min: string
  max: string
  close: string
}

/** `<CandlestickChart>`'s description: how many periods, the range, the last close. */
export function describeCandles(s: CandleSummary, messages?: ChartMessages | undefined): string {
  if (s.count === 0) return fillMessage(messages?.noData ?? '{title}: no data.', 'title', s.title)
  const c1 = fillMessage(fillMessage(messages?.candlestick ?? '{title}: {count} periods, range {min} to {max}, last close {close}.', 'title', s.title), 'count', `${s.count}`)
  return fillMessage(fillMessage(fillMessage(c1, 'min', s.min), 'max', s.max), 'close', s.close)
}

/** What `describeHeatmap` says: the grid's size and its value range, already formatted. */
export interface HeatSummary {
  title: string
  columns: number
  rows: number
  cells: number
  min: string
  max: string
}

/** `<HeatmapChart>`'s description: the grid's size and value range. */
export function describeHeatmap(s: HeatSummary, messages?: ChartMessages | undefined): string {
  if (s.cells === 0) return fillMessage(messages?.noData ?? '{title}: no data.', 'title', s.title)
  const h1 = fillMessage(fillMessage(messages?.heatmap ?? '{title}: {columns} columns by {rows} rows, values {min} to {max}.', 'title', s.title), 'columns', `${s.columns}`)
  return fillMessage(fillMessage(fillMessage(h1, 'rows', `${s.rows}`), 'min', s.min), 'max', s.max)
}

/** The accessible table's caption: the title, and how many rows of how many when only the first rows are built. */
export function tableCaption(title: string, shown: number, total: number, messages?: ChartMessages | undefined): string {
  if (shown >= total) return title
  const c1 = fillMessage(messages?.truncated ?? '{title} (first {shown} of {total} rows)', 'title', title)
  return fillMessage(fillMessage(c1, 'shown', `${shown}`), 'total', `${total}`)
}

/** The ` The value axis is on a log scale.` note for each non-linear axis (`''` for a linear one), in `messages`' words. */
export function scaleNoteText(yScale: string, xScale: string, messages?: ChartMessages | undefined): string {
  const template = messages?.scaleNote ?? ' The {axis} axis is on a {scale} scale.'
  const y = yScale === '' || yScale === 'linear' ? '' : fillMessage(fillMessage(template, 'axis', messages?.valueAxis ?? 'value'), 'scale', yScale)
  const x = xScale === '' || xScale === 'linear' ? '' : fillMessage(fillMessage(template, 'axis', messages?.xAxis ?? 'x'), 'scale', xScale)

  return y + x
}

/**
 * A one-paragraph description: what is plotted, over what, and how it moves.
 *
 * Direction and range are stated because they are what a sighted reader takes
 * from the shape in a glance, and they are exactly what is lost when the shape
 * is unavailable. Reading out every datum instead would bury that.
 */
export function describeChart(input: A11yInput): string {
  const fmt = input.format ?? groupThousands
  const m = input.messages
  const parts: string[] = []
  const title = input.title ?? m?.untitled ?? 'Chart'

  if (input.series.length === 0) {
    return fillMessage(m?.noData ?? '{title}: no data.', 'title', title)
  }

  const n = input.series.length
  const count = n === 1 ? m?.oneSeries ?? '1 series' : fillMessage(m?.manySeries ?? '{n} series', 'n', `${n}`)
  if (input.categories.length > 0) {
    const o1 = fillMessage(m?.overview ?? '{title}. {series} over {count} categories from {first} to {last}.', 'title', title)
    const o2 = fillMessage(fillMessage(o1, 'series', count), 'count', `${input.categories.length}`)
    parts.push(fillMessage(fillMessage(o2, 'first', input.categories[0]!), 'last', input.categories[input.categories.length - 1]!))
  } else {
    parts.push(fillMessage(fillMessage(m?.overviewPlain ?? '{title}. {series}.', 'title', title), 'series', count))
  }
  const emptyText = m?.empty ?? '{label}: empty.'

  for (const s of input.series) {
    if (s.values.length === 0) {
      parts.push(fillMessage(emptyText, 'label', s.label))
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
      parts.push(fillMessage(emptyText, 'label', s.label))
      continue
    }
    const dir = last > first ? m?.rising ?? 'rising' : last < first ? m?.falling ?? 'falling' : m?.flat ?? 'flat'
    // How much, not just which way: "rising" describes a 2% drift and a 3×
    // climb identically. The change is stated relative to the first value,
    // and only where that is meaningful (a zero or negative start has no
    // honest percentage).
    const pct = first > 0.0 && last !== first ? ` ${percentChange(first, last)}` : ''
    const atText = m?.at ?? ' at {category}'
    const at = (i: number): string =>
      i < input.categories.length ? fillMessage(atText, 'category', input.categories[i]!) : ''
    // The slots every trend sentence shares; a band adds its lower edge's range.
    let sentence = ''
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
        sentence = fillMessage(m?.bandTrend ?? '{label}, {kind}: upper bound {direction}{change} from {first} to {last}, ranging {low}{lowAt} to {high}{highAt}; lower bound ranging {low2} to {high2}.', 'low2', fmt(olo))
        sentence = fillMessage(sentence, 'high2', fmt(ohi))
      }
    }
    if (sentence === '') sentence = m?.trend ?? '{label}, {kind}: {direction}{change} from {first} to {last}, ranging {low}{lowAt} to {high}{highAt}.'
    sentence = fillMessage(sentence, 'label', s.label)
    sentence = fillMessage(sentence, 'kind', s.kind)
    sentence = fillMessage(sentence, 'direction', dir)
    sentence = fillMessage(sentence, 'change', pct)
    sentence = fillMessage(sentence, 'first', fmt(first))
    sentence = fillMessage(sentence, 'last', fmt(last))
    sentence = fillMessage(sentence, 'lowAt', at(loAt))
    sentence = fillMessage(sentence, 'low', fmt(lo))
    sentence = fillMessage(sentence, 'highAt', at(hiAt))
    sentence = fillMessage(sentence, 'high', fmt(hi))
    parts.push(sentence)
  }

  return parts.join(' ')
}

/**
 * `45%`, `3.2×`: the size of a change from `first` to `last` (both positive
 * start). Past doubling a multiple reads better than a four-digit percentage.
 */
export function percentChange(first: Double, last: Double): string {
  const ratio = last / first
  if (ratio >= 2.0) return `${Math.floor(ratio * 10.0 + 0.5) / 10.0}×`
  const p = Math.floor(Math.abs(ratio - 1.0) * 100.0 + 0.5)

  return `${p}%`
}

/**
 * One datum of one series, for a keyboard focus that has picked a series:
 * `Revenue: 3,200 at Mar, 3 of 12`. A gap reads as `no value`.
 */
export function describeDatum(input: A11yInput, series: number, index: number): string {
  if (series < 0 || series >= input.series.length) return ''
  const s = input.series[series]!
  if (index < 0 || index >= s.values.length) return ''
  const fmt = input.format ?? groupThousands
  const m = input.messages
  const v = s.values[index]!
  const value = v !== v ? m?.noValue ?? 'no value' : fmt(v)
  const at = index < input.categories.length ? fillMessage(m?.at ?? ' at {category}', 'category', input.categories[index]!) : ''
  const d1 = fillMessage(fillMessage(m?.datum ?? '{label}: {value}{at}, {index} of {count}', 'label', s.label), 'value', value)

  return fillMessage(fillMessage(fillMessage(d1, 'at', at), 'index', `${index + 1}`), 'count', `${s.values.length}`)
}

export interface A11yTable {
  headers: string[]
  rows: string[][]
  /** How many rows the data has — more than `rows` holds when a `limit` cut it. */
  total: number
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
function withError(fmt: Formatter, v: Double, s: A11ySeries, i: number, template: string): string {
  const lo: Double[] = s.errLow ?? []
  const hi: Double[] = s.errHigh ?? []
  if (i >= lo.length || i >= hi.length) return fmt(v)
  const l = lo[i]!
  const h = hi[i]!
  // Infinities are gaps too, matching the cell rule beside it (#3390).
  if (!isFiniteNumber(l) || !isFiniteNumber(h)) return fmt(v)

  return fillMessage(fillMessage(fillMessage(template, 'value', fmt(v)), 'low', fmt(l)), 'high', fmt(h))
}

export function chartTable(input: A11yInput, limit: number = -1): A11yTable {
  // A two-channel series gets two COLUMNS. One column holding only the high
  // edge would hand the reader half a band and no way to tell that is what
  // happened; the table exists for the reader who wants the numbers, and a
  // band's numbers come in pairs.
  const m = input.messages
  const headers = [m?.category ?? 'Category']
  for (const s of input.series) {
    const other: Double[] = s.values2 ?? []
    const rs: Double[] = s.rValues ?? []
    // Independent columns, not a chain: a series carrying BOTH a second
    // bound and a size channel must contribute both, and an `else if` here
    // silently dropped the size for any series that also had bounds.
    if (other.length > 0) {
      headers.push(fillMessage(m?.upper ?? '{label} (upper)', 'label', s.label))
      headers.push(fillMessage(m?.lower ?? '{label} (lower)', 'label', s.label))
    } else {
      headers.push(s.label)
    }
    if (rs.length > 0) headers.push(fillMessage(m?.size ?? '{label} (size)', 'label', s.label))
  }

  const n = chartRowCount(input)

  // `limit` builds only the rows a reader is shown: formatting 100,000 rows to
  // display the first 1,000 was most of a large chart's accessible-table cost.
  const count = limit >= 0 && limit < n ? limit : n
  const rows: string[][] = []
  for (let i = 0; i < count; i++) rows.push(chartTableRow(input, i))

  return { headers, rows, total: n }
}

/** How many rows the chart's table has: the longest of the categories and every series. */
export function chartRowCount(input: A11yInput): number {
  let n = input.categories.length
  for (const s of input.series) if (s.values.length > n) n = s.values.length
  return n
}

/**
 * Row `i` of the chart's table, exactly as `chartTable` builds it — for a
 * reader that needs ONE row (a keyboard focus move announcing the focused
 * item), which used to format every row of the table to read one.
 */
export function chartTableRow(input: A11yInput, i: number): string[] {
  const fmt = input.format ?? groupThousands
  const errText = input.messages?.withError ?? '{value} ({low} to {high})'
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
    row.push(isFiniteNumber(v) ? withError(fmt, v, s, i, errText) : '')
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

  return row
}
