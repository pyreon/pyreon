import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * A visualMap on the value-coloured hosts: the strip is the engine's
 * `VisualStrip` built at compile time by the web's own `visualMap` builder, and
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
import { MapChart, visualMap } from '@pyreon/charts'
const SHAPES = [{ name: 'A', rings: [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]] }]
export function App() {
  return <MapChart animate={false} map={SHAPES} values={{ A: 40 }} visualMap={visualMap({ domain: [0, 100], calculable: true, range: [20, 80], stops: ['#eeeeee', '#aa0000'] })} height={200} />
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
import { CalendarChart, visualMap } from '@pyreon/charts'
export function App() {
  return <CalendarChart animate={false} start="2026-01-01" end="2026-01-31" values={{ '2026-01-05': 3 }} visualMap={visualMap({ domain: [0, 10], type: 'piecewise', pieces: [{ min: 5, label: 'high', color: '#ff0000' }, { max: 5, label: 'low', color: '#0000ff' }] })} height={180} />
}`, { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('visualStripToggle(')
    expect(r.code).toContain('visualOutBands(pyreonStrip, pyreonVmSelected)')
    expect(r.code).toContain('"high"')
    check(r.code)
  })

  it('names a non-literal visualMap', () => {
    const r = transform(`
import { CalendarChart } from '@pyreon/charts'
export function App(props: { vm: { min: number } }) {
  return <CalendarChart animate={false} start="2026-01-01" end="2026-01-31" values={{ '2026-01-05': 3 }} visualMap={props.vm} height={180} />
}`, { target })
    expect(r.warnings).toEqual([expect.stringContaining('<CalendarChart visualMap>: native needs a literal')])
  })
})
