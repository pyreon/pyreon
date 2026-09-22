import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * A visualMap on the value-coloured hosts: the strip is the engine's
 * `VisualStrip` built at compile time from the web's own `visualMapSpec`, and
 * its range / piece selection live in host state that a drag or a tap
 * changes, merged into the options so the values and the strip agree.
 */
describe.each(['swift', 'kotlin'] as const)('visualMap on %s', (target) => {
  const check = (code: string) => {
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(code)).toMatchObject({ ok: true })
  }

  it('a calculable map: the strip, the dragged range in state, and the drag gesture', () => {
    const r = transform(`
import { MapChart } from '@pyreon/charts/plot'
const SHAPES = [{ name: 'A', rings: [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]] }]
export function App() {
  return <MapChart animate={false} map={SHAPES} values={{ A: 40 }} visualMap={{ min: 0, max: 100, calculable: true, range: [20, 80], inRange: { color: ['#eeeeee', '#aa0000'] } }} height={200} />
}`, { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('renderVisualStrip(pyreonStrip, pyreonVmPlace.at, pyreonVmRange, pyreonVmSelected)')
    expect(r.code).toContain('visualStripHandleAt(')
    expect(r.code).toMatch(/calculable ?[:=] ?true/)
    expect(r.code).toContain(target === 'swift' ? 'Domain(min: 20.0, max: 80.0)' : 'Domain(20.0, 80.0)')
    check(r.code)
  })

  it('a piecewise calendar: the pieces, the toggle on tap, and out bands merged into the options', () => {
    const r = transform(`
import { CalendarChart } from '@pyreon/charts/plot'
export function App() {
  return <CalendarChart animate={false} start="2026-01-01" end="2026-01-31" values={{ '2026-01-05': 3 }} visualMap={{ type: 'piecewise', pieces: [{ min: 5, label: 'high', color: '#ff0000' }, { max: 5, label: 'low', color: '#0000ff' }] }} height={180} />
}`, { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('visualStripToggle(')
    expect(r.code).toContain('visualOutBands(pyreonStrip, pyreonVmSelected)')
    expect(r.code).toContain('"high"')
    check(r.code)
  })

  it('an OptionChart heatmap with a calculable visualMap crosses with its range, and compiles', () => {
    const r = transform(`
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return <OptionChart option={{ xAxis: { type: 'category', data: ['a', 'b'] }, yAxis: { type: 'category', data: ['r'] }, visualMap: { min: 0, max: 10, calculable: true, range: [2, 8], orient: 'horizontal' }, series: [{ type: 'heatmap', data: [[0, 0, 3], [1, 0, 9]] }] }} height={220} />
}`, { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('HeatSelection(')
    expect(r.code).toContain(target === 'swift' ? 'Domain(min: 2.0, max: 8.0)' : 'Domain(2.0, 8.0)')
    expect(r.code).toMatch(/vertical ?[:=] ?false/)
    check(r.code)
  })

  it('an OptionChart calendar with a piecewise visualMap crosses its pieces', () => {
    const r = transform(`
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return <OptionChart option={{ calendar: { range: ['2026-01-01', '2026-01-31'] }, visualMap: { type: 'piecewise', pieces: [{ gte: 5, label: 'busy' }, { lt: 5, label: 'quiet' }], selected: { quiet: false } }, series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: [['2026-01-05', 3], ['2026-01-06', 8]] }] }} height={200} />
}`, { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('"busy"')
    expect(r.code).toContain(target === 'swift' ? '[true, false]' : 'listOf(true, false)')
    check(r.code)
  })

  it('names a non-literal visualMap', () => {
    const r = transform(`
import { CalendarChart } from '@pyreon/charts/plot'
export function App(props: { vm: { min: number } }) {
  return <CalendarChart animate={false} start="2026-01-01" end="2026-01-31" values={{ '2026-01-05': 3 }} visualMap={props.vm} height={180} />
}`, { target })
    expect(r.warnings).toEqual([expect.stringContaining('<CalendarChart visualMap>: native needs a literal visualMap')])
  })
})
