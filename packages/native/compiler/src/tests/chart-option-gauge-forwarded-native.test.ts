import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * A literal OptionChart gauge crosses AS THE WEB FACADE COMPILED IT: ECharts'
 * whole dial — its angles, colour bands, ticks and split lines, axis labels,
 * pointer, anchor, titles and detail text — drawn by the engine's
 * `renderDialIn` in the gauge's frame, not the half-circle track the hand
 * lowering drew.
 */
const OPTION = `
import { OptionChart } from '@pyreon/charts/option'
export function App() {
  return (
    <OptionChart option={{
      series: [{
        type: 'gauge',
        center: ['50%', '60%'],
        startAngle: 200,
        endAngle: -20,
        min: 0,
        max: 60,
        splitNumber: 6,
        axisLine: { lineStyle: { width: 18, color: [[0.3, '#67e0e3'], [0.7, '#37a2da'], [1, '#fd666d']] } },
        pointer: { width: 6 },
        anchor: { show: true, size: 14 },
        detail: { formatter: '{value} km/h' },
        data: [{ value: 42, name: 'Speed' }],
      }],
    }} height={260} />
  )
}`

describe.each(['swift', 'kotlin'] as const)('forwarded option gauge on %s', (target) => {
  const sep = target === 'swift' ? ': ' : ' = '
  const r = transform(OPTION, { target })

  it('lowers with zero warnings', () => {
    expect(r.warnings).toEqual([])
  })

  it("draws ECharts' dial in its frame, not the half-circle track", () => {
    expect(r.code).toContain('renderDialIn(DialSpec(')
    expect(r.code).toContain('frameRectAt(FrameSpec(')
    expect(r.code).not.toContain('renderGauge(')
  })

  it('carries the bands, the pointer, the anchor and the formatted detail', () => {
    expect(r.code).toContain('"#fd666d"')
    expect(r.code).toContain(`anchorShow${sep}true`)
    expect(r.code).toContain('"42 km/h"')
    expect(r.code).toContain(`splitNumber${sep}6`)
  })

  it('the toolchain accepts it', () => {
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })
})
