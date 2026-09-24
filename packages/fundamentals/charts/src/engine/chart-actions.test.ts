import { describe, expect, it } from 'vitest'
import { applyChartAction, chartAction, emptyChartActionState } from './chart-actions'
import type { ChartActionInput, ChartActionState } from './chart-actions'

const run = (s: ChartActionState, ...actions: Partial<ChartActionInput>[]): ChartActionState =>
  actions.reduce((acc, a) => applyChartAction(acc, { ...chartAction(a.type ?? ''), ...a }), s)
const empty = emptyChartActionState(3)

describe('applyChartAction — the ECharts action vocabulary as one reducer', () => {
  it('highlight / showTip set the hover; downplay / hideTip clear it', () => {
    expect(run(empty, { type: 'highlight', index: 2 }).hover).toBe(2)
    expect(run(empty, { type: 'showTip', index: 1 }, { type: 'hideTip' }).hover).toBe(-1)
    expect(run(empty, { type: 'highlight', index: 1 }, { type: 'downplay' }).hover).toBe(-1)
  })

  it('select / unselect / toggleSelect keep order, never duplicate, and ignore a miss', () => {
    expect(run(empty, { type: 'select', index: 2 }, { type: 'select', index: 0 }, { type: 'select', index: 2 }).selected).toEqual([2, 0])
    expect(run(empty, { type: 'select', index: 2 }, { type: 'unselect', index: 2 }).selected).toEqual([])
    expect(run(empty, { type: 'toggleSelect', index: 1 }, { type: 'toggleSelect', index: 1 }).selected).toEqual([])
    expect(run(empty, { type: 'select', index: -1 })).toBe(empty)
  })

  it('legend actions hide, show, toggle, show all and invert over the bound series count', () => {
    expect(run(empty, { type: 'legendUnselect', series: 1 }).hidden).toEqual([1])
    expect(run(empty, { type: 'legendUnselect', series: 1 }, { type: 'legendSelect', series: 1 }).hidden).toEqual([])
    expect(run(empty, { type: 'legendToggle', series: 0 }, { type: 'legendToggle', series: 2 }).hidden).toEqual([0, 2])
    expect(run(empty, { type: 'legendUnselect', series: 0 }, { type: 'legendAllSelect' }).hidden).toEqual([])
    expect(run(empty, { type: 'legendUnselect', series: 0 }, { type: 'legendInverseSelect' }).hidden).toEqual([1, 2])
    expect(run(empty, { type: 'legendInverseSelect', series: 5 }).hidden).toEqual([0, 1, 2, 3, 4])
  })

  it('dataZoom clamps through the gesture rules and stores the full window as none', () => {
    const z = run(empty, { type: 'dataZoom', start: 0.2, end: 0.6 })
    expect(z.zoom).toEqual({ start: 0.2, end: 0.6 })
    expect(run(z, { type: 'dataZoom', start: 0, end: 1 }).zoom).toEqual({ start: 0, end: 1 })
    const tiny = run(empty, { type: 'dataZoom', start: 0.5, end: 0.5 })
    expect(tiny.zoom.end - tiny.zoom.start).toBeGreaterThan(0)
  })

  it('brush: takeGlobalCursor arms a type, brush sets or clears the areas', () => {
    const area = { type: 'rect', points: [{ x: 1, y: 1 }, { x: 20, y: 20 }] }
    const armed = run(empty, { type: 'takeGlobalCursor', brushType: 'lineX' }, { type: 'brush', areas: [area] })
    expect(armed.brushType).toBe('lineX')
    expect(armed.areas).toEqual([area])
    expect(run(armed, { type: 'brush', areas: [] }).areas).toEqual([])
  })

  it('restore clears zoom, hover, selection, legend and brush areas, and an unknown type is a no-op', () => {
    const busy = run(empty, { type: 'dataZoom', start: 0.1, end: 0.4 }, { type: 'select', index: 1 }, { type: 'legendToggle', series: 0 }, { type: 'highlight', index: 1 }, { type: 'brush', areas: [{ type: 'rect', points: [] }] })
    expect(run(busy, { type: 'restore' })).toEqual({ ...busy, zoom: { start: 0, end: 1 }, hover: -1, selected: [], hidden: [], areas: [] })
    expect(run(busy, { type: 'makeCoffee' })).toBe(busy)
  })
})
