import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * ECharts' pictorialBar geometry keys cross the OptionChart natively as the
 * same six Series fields the web facade fills (the engine's `pictorial`
 * module draws them); percent strings and an unknown position are named.
 */
const app = (series: string): string => `
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return <OptionChart option={{ xAxis: { type: 'category', data: ['a', 'b'] }, yAxis: {}, series: [${series}] }} />
}`

describe.each(['swift', 'kotlin'] as const)('pictorial bars on %s', (target) => {
  it('lowers symbolMargin / symbolOffset / symbolPosition / symbolRotate / symbolClip / symbolBoundingData with zero warnings, and compiles', () => {
    const r = transform(app(`{ type: 'pictorialBar', symbol: 'circle', symbolRepeat: true, symbolClip: true, symbolMargin: 4, symbolBoundingData: 10, symbolOffset: [0, 2], symbolPosition: 'end', symbolRotate: 30, data: [3, 7] }`), { target })
    expect(r.warnings).toEqual([])
    const sep = target === 'swift' ? ': ' : ' = '
    expect(r.code).toContain(`symbolMargin${sep}4.0`)
    expect(r.code).toContain(target === 'swift' ? 'symbolOffset: [0.0, 2.0]' : 'symbolOffset = listOf<Double>(0.0, 2.0)')
    expect(r.code).toContain(`symbolPosition${sep}"end"`)
    expect(r.code).toContain(`symbolRotate${sep}30.0`)
    expect(r.code).toContain(`symbolClip${sep}true`)
    expect(r.code).toContain(`symbolBoundingData${sep}10.0`)
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it('names percent strings and an unknown position, like the web', () => {
    const r = transform(app(`{ type: 'pictorialBar', symbolMargin: '10%', symbolOffset: ['5%', 0], symbolPosition: 'middle', data: [3, 7] }`), { target })
    expect(r.warnings).toEqual([
      expect.stringContaining('option.series[0].symbolMargin>'),
      expect.stringContaining('option.series[0].symbolOffset>'),
      expect.stringContaining('option.series[0].symbolPosition>'),
    ])
    expect(r.code).not.toContain('symbolMargin')
  })
})
