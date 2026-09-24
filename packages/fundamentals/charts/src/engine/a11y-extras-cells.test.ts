// `chartTable` is the accessible table a screen-reader user reads INSTEAD of
// the chart, so a cell that comes out wrong is the whole datum lost for that
// reader. The extras columns (a dataset's other dimensions, ECharts'
// `encode.tooltip`) have three per-row arms — a number, a text, and nothing at
// all — and the number arm has its own non-finite half. A short column must
// pad rather than shift every later cell one place left.
import { describe, expect, it } from 'vitest'
import { chartTable } from './a11y'

const table = (extras: { label: string; numbers?: number[]; texts?: string[] }[]) =>
  chartTable({
    categories: ['a', 'b', 'c'],
    series: [{ label: 'S', values: [1, 2, 3], kind: 'bars', extras }],
  })

describe('chartTable — the extras columns', () => {
  it('prints one column per extra, named after the series and the extra', () => {
    const t = table([{ label: 'Region', texts: ['n', 's', 'e'] }])
    expect(t.headers).toContain('S (Region)')
    expect(t.rows.map((r) => r.at(-1))).toEqual(['n', 's', 'e'])
  })

  it('formats a NUMERIC extra like a value', () => {
    const t = table([{ label: 'Count', numbers: [10, 20, 30] }])
    expect(t.rows.map((r) => r.at(-1))).toEqual(['10', '20', '30'])
  })

  it('a NON-FINITE number is an empty cell, not "NaN" or "Infinity"', () => {
    // Read aloud, "NaN" is noise; an empty cell is the honest "no value here".
    const t = table([{ label: 'Count', numbers: [10, Number.NaN, Number.POSITIVE_INFINITY] }])
    expect(t.rows.map((r) => r.at(-1))).toEqual(['10', '', ''])
  })

  it('a SHORT column pads rather than shifting the remaining rows', () => {
    const t = table([{ label: 'Count', numbers: [10] }])
    expect(t.rows.map((r) => r.at(-1))).toEqual(['10', '', ''])
  })

  it('an extra with neither numbers nor texts fills every row with an empty cell', () => {
    const t = table([{ label: 'Empty' }])
    expect(t.headers).toContain('S (Empty)')
    expect(t.rows.map((r) => r.at(-1))).toEqual(['', '', ''])
  })

  it('numbers win over texts when an extra carries both', () => {
    const t = table([{ label: 'Both', numbers: [1, 2], texts: ['x', 'y', 'z'] }])
    // The first two rows take the number; the third falls through to the text.
    expect(t.rows.map((r) => r.at(-1))).toEqual(['1', '2', 'z'])
  })

  it('several extras each get their own column, in order', () => {
    const t = table([
      { label: 'One', numbers: [1, 2, 3] },
      { label: 'Two', texts: ['p', 'q', 'r'] },
    ])
    expect(t.headers.slice(-2)).toEqual(['S (One)', 'S (Two)'])
    expect(t.rows[0]!.slice(-2)).toEqual(['1', 'p'])
  })
})
