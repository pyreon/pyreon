import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * An OptionChart family chart ECharts places inside the chart — a funnel in
 * its 80 / 60 margins, a treemap in 10%, a sankey in its 5% / 20% box, a
 * sunburst at a 75% radius — lays out in that frame on native too: the
 * engine's `frameRectAt` resolves the web-read `FrameSpec` at the device's
 * size, the draw list is shifted into it and the tap out of it.
 */
const chart = (series: string): string => `
import { OptionChart } from '@pyreon/charts/option'
export function App() {
  return <OptionChart option={{ series: [${series}] }} onSelectIndex={(i: number) => {}} tooltip />
}`

const CASES: [string, string][] = [
  ['funnel (default margins)', "{ type: 'funnel', data: [{ name: 'a', value: 60 }, { name: 'b', value: 30 }] }"],
  ['funnel (own box keys)', "{ type: 'funnel', left: '10%', top: 20, width: '60%', height: 200, data: [{ name: 'a', value: 60 }, { name: 'b', value: 30 }] }"],
  ['treemap', "{ type: 'treemap', data: [{ name: 'a', value: 6 }, { name: 'b', value: 3 }] }"],
  ['sankey', "{ type: 'sankey', data: [{ name: 'a' }, { name: 'b' }], links: [{ source: 'a', target: 'b', value: 5 }] }"],
  ['sunburst', "{ type: 'sunburst', center: ['45%', '50%'], data: [{ name: 'a', value: 6 }, { name: 'b', value: 3 }] }"],
]

describe.each(['swift', 'kotlin'] as const)('placed family frames on %s', (target) => {
  for (const [name, series] of CASES) {
    it(`${name}: lays out in its ECharts frame, and compiles`, () => {
      const r = transform(chart(series), { target })
      expect(r.warnings).toEqual([])
      expect(r.code).toContain('frameRectAt(FrameSpec(')
      expect(r.code).toContain('pyreonShiftCmdsXY(')
      expect(r.code).toContain('pyreonFrame.w')
      if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
      if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
    })
  }
})
