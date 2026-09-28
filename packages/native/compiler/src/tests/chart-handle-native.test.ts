import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * ECharts' `dispatchAction` on native: `createChartHandle()` lowers to a
 * PyreonChartHandle whose fields the bound `<PlotChart handle>` reads and
 * writes in place of its private state, and `handle.dispatch({...})` lowers to
 * the crossing reducer's full `ChartActionInput` — the web handle's function.
 */
describe.each(['swift', 'kotlin'] as const)('chart handle on %s', (target) => {
  const check = (code: string) => {
    if (target === 'swift' && isSwiftcAvailable()) { const v = validateSwiftWithStubs(code); if (!v.ok) console.log("SWIFTERR", String((v as { error?: string }).error ?? "").split("\n").filter((l) => l.includes("error:")).slice(0, 6).join(" || ")); expect(v).toMatchObject({ ok: true }) }
    if (target === 'kotlin' && isKotlincAvailable()) { const v = validateKotlin(code); if (!v.ok) console.log("KTERR", String((v as { error?: string }).error ?? "").split("\n").filter((l) => l.includes("error:")).map((l) => l.slice(0, 160)).slice(0, 6).join(" || ")); expect(v).toMatchObject({ ok: true }) }
  }

  it('the handle binds the chart state and every action shape lowers', () => {
    const r = transform(`
import { Stack, Button } from '@pyreon/primitives'
import { createChartHandle } from '@pyreon/charts'
import { PlotChart, bars, line } from '@pyreon/charts/engine'
const ROWS = [{ a: 1, b: 3 }, { a: 2, b: 2 }, { a: 3, b: 1 }]
export function App() {
  const chart = createChartHandle()
  return <Stack>
    <PlotChart data={ROWS} marks={[bars((d) => d.a), line((d) => d.b)]} height={200} handle={chart} showLegend selectedMode="multiple" />
    <Button onPress={() => chart.dispatch({ type: 'select', index: 1 })}>Pin</Button>
    <Button onPress={() => chart.dispatch({ type: 'dataZoom', start: 0, end: 0.5 })}>Zoom</Button>
    <Button onPress={() => chart.dispatch({ type: 'legendInverseSelect' })}>Invert</Button>
    <Button onPress={() => chart.dispatch({ type: 'takeGlobalCursor', brushType: 'lineX' })}>Brush</Button>
    <Button onPress={() => chart.dispatch({ type: 'brush', areas: [] })}>Clear</Button>
    <Button onPress={() => chart.dispatch({ type: 'restore' })}>Reset</Button>
  </Stack>
}`, { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(target === 'swift' ? 'PyreonChartHandle(seriesCount: 2)' : 'PyreonChartHandle()')
    for (const s of ['chart.zoom', 'chart.selected', 'chart.hidden', 'chart.areas', 'chart.hover', ...(target === 'kotlin' ? ['chart.seriesCount = 2 }'] : [])]) expect(r.code).toContain(s)
    expect(r.code).toMatch(target === 'swift' ? /chart\.dispatch\(ChartActionInput\(type: "dataZoom", index: -1, series: -1, start: Double\(0\), end: Double\(0\.5\)/ : /chart\.dispatch\(ChartActionInput\(type = "dataZoom", index = -1, series = -1, start = \(0\)\.toDouble\(\), end = \(0\.5\)\.toDouble\(\)/)
    // The handle's fields replace the private state: nothing declares it twice.
    expect(r.code).not.toMatch(/pyreonSelected|pyreonHidden\b/)
    check(r.code)
  })

  it('a handle that is not a createChartHandle() const, and a non-literal action, warn by name', () => {
    const r = transform(`
import { Stack, Button } from '@pyreon/primitives'
import { createChartHandle } from '@pyreon/charts'
import { PlotChart, bars } from '@pyreon/charts/engine'
const ROWS = [{ a: 1 }]
export function App(props: { h: any; act: any }) {
  const chart = createChartHandle()
  return <Stack>
    <PlotChart data={ROWS} marks={[bars((d) => d.a)]} height={200} handle={props.h} />
    <Button onPress={() => chart.dispatch(props.act)}>Go</Button>
  </Stack>
}`, { target })
    expect(r.warnings.some((w) => w.includes('<PlotChart handle>'))).toBe(true)
    expect(r.warnings.some((w) => w.includes('<chart.dispatch>'))).toBe(true)
  })

  it('every plot drag shares ONE DragGesture (SwiftUI runs only one of several chained simultaneous drags)', () => {
    if (target !== 'swift') return
    const r = transform(`
import { createChartHandle } from '@pyreon/charts'
import { PlotChart, bars } from '@pyreon/charts/engine'
const ROWS = [{ a: 1 }, { a: 2 }, { a: 3 }]
export function App() {
  const chart = createChartHandle()
  return <PlotChart data={ROWS} marks={[bars((d) => d.a)]} height={200} handle={chart} dataZoom toolbox={{ dataZoom: true, brush: ['rect'] }} />
}`, { target })
    expect(r.warnings).toEqual([])
    expect(r.code.match(/DragGesture\(minimumDistance: 8\)/g)).toHaveLength(1)
    check(r.code)
  })

  it('selectedMode under a zoom window compiles (it referenced rows only a decimated chart declares)', () => {
    const r = transform(`
import { PlotChart, bars } from '@pyreon/charts/engine'
const ROWS = [{ a: 1 }, { a: 2 }, { a: 3 }]
export function App() {
  return <PlotChart data={ROWS} marks={[bars((d) => d.a)]} height={200} dataZoom selectedMode="multiple" />
}`, { target })
    expect(r.warnings).toEqual([])
    expect(r.code).not.toContain('pyreonRows')
    check(r.code)
  })
})
