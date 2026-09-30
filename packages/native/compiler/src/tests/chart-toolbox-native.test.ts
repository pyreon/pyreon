import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * `<PlotChart toolbox>` on native: the engine's toolbox over the top-right,
 * the magicType switches rewriting the spec, the box zoom with back, the data
 * view, restore, and saveAsImage as the share sheet (or a PNG data URL into
 * `onSaveImage`).
 */
describe.each(['swift', 'kotlin'] as const)('PlotChart toolbox on %s', (target) => {
  const check = (code: string) => {
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(code)).toMatchObject({ ok: true })
  }
  const app = (extra: string) => `
import { PlotChart, bars } from '@pyreon/charts/engine'
const ROWS = [{ a: 1, b: 4 }, { a: 2, b: 3 }, { a: 3, b: 2 }, { a: 4, b: 1 }]
export function App() {
  return <PlotChart data={ROWS} marks={[bars((d) => d.a), bars((d) => d.b)]} height={240} ${extra} />
}`

  it('every tool lowers: switches, box zoom with back, data view, restore, share', () => {
    const r = transform(app(`toolbox={{ dataZoom: true, dataView: true, magicType: ['line', 'bar', 'stack', 'tiled'], restore: true, saveAsImage: true }}`), { target })
    expect(r.warnings).toEqual([])
    for (const s of ['renderToolbox(', 'hitToolbox(', 'applyMagicType(', 'windowOfRows(', 'chartTable(', 'pyreonShareChartImage(']) expect(r.code).toContain(s)
    check(r.code)
  })

  it('onSaveImage receives the PNG data URL instead of the share sheet', () => {
    const r = transform(app(`toolbox={{ saveAsImage: true }} onSaveImage={(url: string) => console.log(url)}`), { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('pyreonChartDataUrl(')
    expect(r.code).not.toContain('pyreonShareChartImage(')
    check(r.code)
  })

  it.each([
    ['PieChart', `<PieChart data={[{ n: 'a', v: 1 }, { n: 'b', v: 2 }]} value={(d) => d.v} label={(d) => d.n} height={200} toolbox={{ saveAsImage: true }} title="Share" />`],
    ['HeatmapChart', `<HeatmapChart data={[{ x: 'a', y: 'r', v: 1 }]} x={(d) => d.x} y={(d) => d.y} value={(d) => d.v} height={200} toolbox={{ saveAsImage: true }} onSaveImage={(url: string) => console.log(url)} />`],
    ['SankeyChart', `<SankeyChart nodes={[{ name: 'a' }, { name: 'b' }]} links={[{ source: 'a', target: 'b', value: 1 }]} height={200} toolbox={{ saveAsImage: true }} />`],
  ])('a family host (%s) draws the save button and shares or reports the image', (_tag, jsx) => {
    const r = transform(`
import { SankeyChart } from '@pyreon/charts'
import { PieChart, HeatmapChart } from '@pyreon/charts/engine'
export function App() {
  return ${jsx}
}`, { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('pyreon-save-image')
    expect(r.code).toMatch(/pyreonShareChartImage\(|pyreonChartDataUrl\(/)
    check(r.code)
  })
})


/**
 * SwiftUI folds a one-child host into ONE accessibility element, so the data
 * view and the family save button were drawn but unreachable by VoiceOver and
 * XCUITest (found on the device lane). The data view goes after the chart's
 * label, and both hosts keep their children with `.contain`.
 */
describe('toolbox overlays stay reachable in the SwiftUI accessibility tree', () => {
  it('the data view is attached after the chart label, on a .contain host', () => {
    const r = transform(`
import { PlotChart, bars } from '@pyreon/charts/engine'
const ROWS = [{ a: 1 }, { a: 2 }]
export function App() {
  return <PlotChart data={ROWS} marks={[bars((d) => d.a)]} height={240} toolbox={{ dataView: true }} data-testid="tb" />
}`, { target: 'swift' })
    const label = r.code.indexOf('.accessibilityLabel(describeChart(')
    const overlay = r.code.indexOf('.overlay(alignment: .topLeading) { if pyreonDataView')
    expect(label).toBeGreaterThan(-1)
    expect(overlay).toBeGreaterThan(label)
    expect(r.code).toMatch(/\.frame\(height: 240\.0\)\.accessibilityElement\(children: \.contain\)/)
  })

  it('the family save button sits in a .contain host', () => {
    const r = transform(`
import { PieChart } from '@pyreon/charts/engine'
export function App() {
  return <PieChart data={[{ n: 'a', v: 1 }]} value={(d) => d.v} label={(d) => d.n} height={200} toolbox={{ saveAsImage: true }} />
}`, { target: 'swift' })
    expect(r.code).toContain('.accessibilityIdentifier("pyreon-save-image") } }.accessibilityElement(children: .contain)')
  })
})
