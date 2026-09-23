import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * A literal OptionChart pie crosses AS THE WEB FACADE COMPILED IT: ECharts'
 * arcs (start angle, direction, rose, gaps), its labels (outside with guide
 * lines, avoided overlaps), per-datum colours, and its placement — `center` /
 * `radius` / the box keys — resolved by the engine's `frameRect` at the
 * device's own size. The tap and the tooltip hit the same laid-out arcs.
 */
const OPTION = `
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return (
    <OptionChart option={{
      series: [{
        type: 'pie',
        center: ['40%', '55%'],
        radius: ['20%', '60%'],
        startAngle: 180,
        clockwise: false,
        roseType: 'radius',
        padAngle: 2,
        label: { position: 'outside' },
        data: [{ name: 'A', value: 3, itemStyle: { color: '#ff0000' } }, { name: 'B', value: 5 }, { name: 'C', value: 2 }],
      }],
    }} onSelectIndex={(i: number) => {}} tooltip />
  )
}`

describe.each(['swift', 'kotlin'] as const)('forwarded option pie on %s', (target) => {
  const sep = target === 'swift' ? ': ' : ' = '
  const r = transform(OPTION, { target })

  it('lowers with zero warnings', () => {
    expect(r.warnings).toEqual([])
  })

  it('places the pie through the engine frame, at the device size', () => {
    expect(r.code).toContain('frameRectAt(FrameSpec(')
    expect(r.code).toContain(`round${sep}true`)
    expect(r.code).toContain('frameViewAt(FrameSpec(')
  })

  it("lays the arcs round as ECharts does: the start, the direction, the rose, the gap", () => {
    expect(r.code).toContain('ArcConfig(')
    expect(r.code).toContain(`clockwise${sep}false`)
    expect(r.code).toContain(`rose${sep}"radius"`)
    expect(r.code).toContain(`padAngle${sep}`)
  })

  it('draws ECharts labels, and taps and tips the same laid-out arcs', () => {
    expect(r.code).toContain('PieLabelOptions(')
    expect(r.code).toContain(`position${sep}"outside"`)
    expect(r.code).toContain('pieHitWith(')
    expect(r.code).toContain('pieTipWith(')
  })

  it("carries a datum's own colour", () => {
    expect(r.code).toContain('"#ff0000"')
  })

  it('the toolchain accepts it', () => {
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })
})
