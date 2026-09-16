// `ChartHandle.dispatch` is ECharts' `dispatchAction` vocabulary over shared
// signals. The legend arms are the ones worth pinning: `legendAllSelect` and
// `legendInverseSelect` are the two that WRITE a whole set rather than one
// index, so an off-by-one there hides every series at once — and the browser
// suite next door drives the hosts, not the vocabulary.
import { describe, expect, it } from 'vitest'
import { createChartHandle } from './link'

describe('ChartHandle.dispatch — selection and legend vocabulary', () => {
  it('select adds an index once; unselect removes it', () => {
    const chart = createChartHandle()
    chart.dispatch({ type: 'select', index: 2 })
    chart.dispatch({ type: 'select', index: 2 }) // idempotent: no duplicate
    expect(chart.selected()).toEqual([2])
    chart.dispatch({ type: 'unselect', index: 2 })
    expect(chart.selected()).toEqual([])
  })

  it('highlight and downplay move the hover index', () => {
    const chart = createChartHandle()
    chart.dispatch({ type: 'highlight', index: 3 })
    expect(chart.hover()).toBe(3)
    chart.dispatch({ type: 'downplay' })
    expect(chart.hover()).toBe(-1)
  })

  it('legendAllSelect clears the hidden set, and is a no-op when nothing is hidden', () => {
    const chart = createChartHandle()
    chart.dispatch({ type: 'legendToggle', series: 1 })
    expect(chart.hidden()).toEqual([1])
    chart.dispatch({ type: 'legendAllSelect' })
    expect(chart.hidden()).toEqual([])
    chart.dispatch({ type: 'legendAllSelect' }) // already empty — the guard arm
    expect(chart.hidden()).toEqual([])
  })

  it('legendInverseSelect flips the hidden set across the series count', () => {
    const chart = createChartHandle()
    chart.dispatch({ type: 'legendToggle', series: 0 })
    // `count` supplied explicitly — the arm that does not consult seriesCount.
    chart.dispatch({ type: 'legendInverseSelect', count: 3 })
    expect(chart.hidden()).toEqual([1, 2])
  })
})
