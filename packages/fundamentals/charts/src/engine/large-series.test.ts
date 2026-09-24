// A 100,000-point series must cost what its DRAWING costs, not a per-point
// tax in the chrome around it. Measured in real Chromium against ECharts
// (examples/benchmark `bench:charts`): a 100k line took ~320ms to mount, and
// ~84% of it was `measureText` on every category label, before the plot was
// laid out at all. Each spec below locks one of the fixes as a COUNT, which is
// deterministic where a timing is not.
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'
import { chartTable } from './a11y'
import type { A11yTable } from './a11y'
import { a11yTableNode } from './canvas-host'
import { computeLayout } from './layout'
import type { LayoutConfig } from './layout'
import type { MeasureText } from './types'

const labels = (n: number): string[] => Array.from({ length: n }, (_, i) => String(i))

function counting(): { measure: MeasureText; calls: () => number } {
  let n = 0
  return {
    measure: (text, size) => {
      n++
      return text.length * size * 0.6
    },
    calls: () => n,
  }
}

const cfg = (over: Partial<LayoutConfig>): LayoutConfig => ({
  width: 800,
  height: 400,
  xDomain: { min: 0, max: 1 },
  yDomain: { min: 0, max: 100 },
  categories: [],
  fontSize: 12,
  xTickCount: 5,
  yTickCount: 5,
  showXAxis: true,
  showYAxis: true,
  ...over,
})

describe('category labels are sampled, as ECharts samples them', () => {
  it('a 100,000-category x axis measures ~40 labels, not 100,000', () => {
    const m = counting()
    computeLayout(cfg({ categories: labels(100_000) }), m.measure)
    // 40 sampled x labels + the handful of provisional y ticks.
    expect(m.calls()).toBeLessThan(100)
  })

  it('so does a horizontal chart, whose categories size the y gutter', () => {
    const m = counting()
    computeLayout(cfg({ categories: labels(100_000), horizontal: true }), m.measure)
    expect(m.calls()).toBeLessThan(100)
  })

  it('40 or fewer labels are all measured — the sample is exact there', () => {
    const m = counting()
    computeLayout(cfg({ categories: labels(40), yTickCount: 0, showYAxis: false }), m.measure)
    expect(m.calls()).toBeGreaterThanOrEqual(40)
  })
})

describe('the label step is not capped', () => {
  // The step was computed by a counting loop that stopped at 200 (and at 1000
  // on the ECharts path), so a 100,000-category axis drew 500 slanted labels
  // on top of each other instead of the few dozen that fit.
  const shown = (every: number, n: number): number => Math.ceil(n / Math.max(1, every))

  it('auto mode thins 100,000 categories to what fits the axis', () => {
    const l = computeLayout(cfg({ categories: labels(100_000) }), (t, s) => t.length * s * 0.6)
    expect(shown(l.xLabelEvery, 100_000)).toBeLessThanOrEqual(60)
  })

  it('a small axis keeps its exact step', () => {
    const l = computeLayout(cfg({ categories: labels(12) }), (t, s) => t.length * s * 0.6)
    expect(l.xLabelEvery).toBe(1)
  })
})

describe('the accessible table formats only the rows it shows', () => {
  const input = (n: number) => ({ title: 'T', categories: labels(n), series: [{ kind: 'line' as const, label: 'S', values: Array.from({ length: n }, (_, i) => i) }] })

  it('a limit caps the rows and reports the total', () => {
    const t = chartTable(input(5000), 1000)
    expect(t.rows).toHaveLength(1000)
    expect(t.total).toBe(5000)
    expect(t.rows[999]).toEqual(['999', '999'])
  })

  it('without one every row is built', () => {
    const t = chartTable(input(12))
    expect(t.rows).toHaveLength(12)
    expect(t.total).toBe(12)
  })
})

describe('the accessible table updates in place', () => {
  const table = (rows: string[][], total = rows.length): A11yTable => ({ headers: ['Category', 'S'], rows, total })

  it('a data update rewrites cell text without remounting rows', () => {
    const data = signal(table([['a', '1'], ['b', '2']]))
    const root = document.createElement('div')
    mount(h('div', null, a11yTableNode(() => data(), 'tbl', () => 'Title')), root)
    const firstRow = root.querySelector('tbody tr')
    expect(root.querySelector('caption')!.textContent).toBe('Title')
    data.set(table([['a', '10'], ['b', '20']]))
    expect(root.querySelector('tbody tr')).toBe(firstRow)
    expect([...root.querySelectorAll('tbody td')].map((c) => c.textContent)).toEqual(['10', '20'])
    expect(root.querySelector('tbody th')!.getAttribute('scope')).toBe('row')
    expect(root.querySelector('thead th')!.getAttribute('scope')).toBe('col')
  })

  it('a row count change adds and removes rows, and the caption says what was cut', () => {
    const data = signal(table([['a', '1']]))
    const root = document.createElement('div')
    mount(h('div', null, a11yTableNode(() => data(), 'tbl', () => 'Title')), root)
    data.set(table([['a', '1'], ['b', '2'], ['c', '3']], 9))
    expect(root.querySelectorAll('tbody tr')).toHaveLength(3)
    expect(root.querySelector('caption')!.textContent).toBe('Title (first 3 of 9 rows)')
    data.set(table([['z', '0']]))
    expect(root.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(root.querySelector('tbody th')!.textContent).toBe('z')
  })
})
