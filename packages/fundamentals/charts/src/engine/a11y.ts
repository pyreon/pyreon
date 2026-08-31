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
import type { Double } from './types'

export interface A11ySeries {
  label: string
  values: Double[]
  kind: string
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
    let lo = s.values[0]!
    let hi = s.values[0]!
    let loAt = 0
    let hiAt = 0
    for (let i = 0; i < s.values.length; i++) {
      const v = s.values[i]!
      if (v < lo) { lo = v; loAt = i }
      if (v > hi) { hi = v; hiAt = i }
    }
    const first = s.values[0]!
    const last = s.values[s.values.length - 1]!
    const dir = last > first ? 'rising' : last < first ? 'falling' : 'flat'
    const at = (i: number): string =>
      input.categories[i] !== undefined ? ` at ${input.categories[i]!}` : ''
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
export function chartTable(input: A11yInput): A11yTable {
  const fmt = input.format ?? plain
  const headers = ['Category']
  for (const s of input.series) headers.push(s.label)

  let n = input.categories.length
  for (const s of input.series) if (s.values.length > n) n = s.values.length

  const rows: string[][] = []
  for (let i = 0; i < n; i++) {
    const row = [input.categories[i] ?? `${i + 1}`]
    for (const s of input.series) {
      const v = s.values[i]
      row.push(v === undefined ? '' : fmt(v))
    }
    rows.push(row)
  }
  return { headers, rows }
}
