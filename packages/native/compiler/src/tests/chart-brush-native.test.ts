import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * ECharts' area brush on native: `<PlotChart brushType brushMode
 * outOfBrushOpacity brushSeriesIndex onBrushSelected>` and the toolbox brush
 * tools build the same `brush-area` areas, dim through `applyBrushSelection`
 * and report per series, as the web host does. `OptionChart`'s `option.brush`
 * and `toolbox.feature.brush` lower onto that host through the web readers.
 */
describe.each(['swift', 'kotlin'] as const)('area brush on %s', (target) => {
  const check = (code: string) => {
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(code)).toMatchObject({ ok: true })
  }

  it('a PlotChart brush lowers every prop and tool, with the report', () => {
    const r = transform(`
import { signal } from '@pyreon/reactivity'
import { PlotChart, bars, line } from '@pyreon/charts/plot'
const ROWS = [{ a: 1, b: 3 }, { a: 2, b: 2 }, { a: 3, b: 1 }]
export function App() {
  const picked = signal(0)
  return <PlotChart data={ROWS} marks={[bars((d) => d.a), line((d) => d.b)]} height={240} brushType="lineX" brushMode="multiple" outOfBrushOpacity={0.2} brushSeriesIndex={[0]} toolbox={{ brush: ['rect', 'polygon', 'lineX', 'lineY', 'keep', 'clear'], dataZoom: true, restore: true }} onBrushSelected={(s) => picked.set(s[0].dataIndex.length)} />
}`, { target })
    expect(r.warnings).toEqual([])
    for (const s of ['brushAreaFromDrag(', 'brushPolygonAdd(', 'brushAreaUsable(', 'applyBrushSelection(', 'renderBrushAreas(', 'brushOnlySeries(', 'brushRect', 'brushClear']) expect(r.code).toContain(s)
    expect(r.code).toContain('0.2')
    check(r.code)
  })

  it('a toolbox brush alone arms nothing until a tool is taken up', () => {
    const r = transform(`
import { PlotChart, bars } from '@pyreon/charts/plot'
const ROWS = [{ a: 1 }, { a: 2 }]
export function App() {
  return <PlotChart data={ROWS} marks={[bars((d) => d.a)]} height={200} toolbox={{ brush: ['rect', 'clear'] }} />
}`, { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toMatch(target === 'swift' ? /pyreonAreaType: String = ""/ : /pyreonAreaType by remember \{ mutableStateOf\(""\) \}/)
    check(r.code)
  })

  it('non-literal brush props and an unknown tool warn by name', () => {
    const r = transform(`
import { PlotChart, bars } from '@pyreon/charts/plot'
const ROWS = [{ a: 1 }]
const kind = Math.random() > 0.5 ? 'rect' : 'lineX'
export function App() {
  return <PlotChart data={ROWS} marks={[bars((d) => d.a)]} height={200} brushType={kind} toolbox={{ brush: ['lasso'] }} />
}`, { target })
    expect(r.warnings.some((w) => w.includes('<PlotChart brushType>'))).toBe(true)
    expect(r.warnings.some((w) => w.includes('"lasso" is not a brush tool'))).toBe(true)
  })

  it('OptionChart option.brush + toolbox.feature.brush lower onto the plot host', () => {
    const r = transform(`
import { signal } from '@pyreon/reactivity'
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  const picked = signal(0)
  return <OptionChart height={240} onBrushSelected={(s) => picked.set(s.length)} option={{
    brush: { brushMode: 'multiple', outOfBrush: { colorAlpha: 0.3 }, seriesIndex: [1] },
    toolbox: { feature: { brush: { type: ['lineX', 'clear'] } } },
    xAxis: { type: 'category', data: ['a', 'b', 'c'] },
    yAxis: {},
    series: [{ type: 'bar', data: [1, 2, 3] }, { type: 'line', data: [3, 2, 1] }],
  }} />
}`, { target })
    expect(r.warnings).toEqual([])
    for (const s of ['brushLineX', 'brushClear', 'brushOnlySeries(', '0.3']) expect(r.code).toContain(s)
    check(r.code)
  })
})
