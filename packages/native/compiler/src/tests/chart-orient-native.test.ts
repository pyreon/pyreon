import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * `orient="vertical"` on the transposable hosts — Sankey, Calendar, Parallel
 * — and the option facade's spellings (`series.orient`, `calendar.orient`,
 * `parallel.layout`). The native emit lays out in the transposed box (W and H
 * swapped) and reflects the draw list back through `pyreonTransposeCmds`; a
 * tap is reflected before its hit.
 */
const HOSTS = `
import { SankeyChart, CalendarChart, ParallelChart } from '@pyreon/charts/plot'
export function App(props: { orient: 'horizontal' | 'vertical'; onPick: (i: number) => void }) {
  return (
    <Stack>
      <SankeyChart nodes={[{ name: 'a' }, { name: 'b' }]} links={[{ source: 'a', target: 'b', value: 1 }]} orient="vertical" onSelectIndex={(i) => props.onPick(i.node)} width={300} height={200} />
      <CalendarChart start="2024-01-01" end="2024-01-31" values={{ '2024-01-02': 3 }} orient="vertical" width={300} height={200} />
      <ParallelChart axes={[{ name: 'a' }, { name: 'b' }]} rows={[[1, 2]]} orient="vertical" width={300} height={200} />
      <SankeyChart nodes={[{ name: 'a' }, { name: 'b' }]} links={[{ source: 'a', target: 'b', value: 1 }]} width={300} height={200} />
    </Stack>
  )
}`

describe.each(['swift', 'kotlin'] as const)('vertical orient on %s', (target) => {
  it('transposes the three hosts: layout in the swapped box, the draw list reflected back, the tap reflected before its hit', () => {
    const r = transform(HOSTS, { target })
    expect(r.warnings).toEqual([])
    // Three vertical hosts, one horizontal one: three transposes.
    expect(r.code.match(/pyreonTransposeCmds\(/g)?.length).toBe(3)
    // The vertical sankey lays out with height and width swapped (200 wide, 300 tall box).
    const verticalSankey = r.code.indexOf('pyreonTransposeCmds(')
    const layoutSankey = r.code.lastIndexOf('layoutSankey(', verticalSankey + 400)
    const layoutSlice = r.code.slice(layoutSankey, layoutSankey + 300)
    expect(layoutSlice).toMatch(/200\.0 - 80\.0 \* 2\.0/)
    expect(layoutSlice).toMatch(/300\.0 - 16\.0/)
    // The tap hands the engine (y, x): the hit reads the transposed layout.
    expect(r.code).toMatch(target === 'swift' ? /hitSankeyIndex\(pyreonLayout, Double\(pyreonTap\.location\.y\)[^,]*, Double\(pyreonTap\.location\.x\)/ : /hitSankeyIndex\(pyreonLayout, \(pyreonTap\.y \/ pyreonDensity\)\.toDouble\(\)[^,]*, \(pyreonTap\.x \/ pyreonDensity\)\.toDouble\(\)/)
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it('a reactive orient is named rather than lowered as horizontal silently', () => {
    const r = transform(`
import { SankeyChart } from '@pyreon/charts/plot'
export function App(props: { orient: 'horizontal' | 'vertical' }) {
  return <SankeyChart nodes={[{ name: 'a' }]} links={[]} orient={props.orient} />
}`, { target })
    expect(r.warnings.some((w) => w.includes('<SankeyChart orient={…}>: must be a literal on native'))).toBe(true)
    expect(r.code).not.toContain('pyreonTransposeCmds(')
  })

  it("the option facade's spellings reach the hosts: series.orient, calendar.orient and parallel.layout", () => {
    const r = transform(`
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return (
    <Stack>
      <OptionChart option={{ series: [{ type: 'sankey', orient: 'vertical', data: [{ name: 'a' }, { name: 'b' }], links: [{ source: 'a', target: 'b', value: 1 }] }] }} />
      <OptionChart option={{ calendar: { range: '2024-01', orient: 'vertical' }, series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: [['2024-01-02', 3]] }] }} />
      <OptionChart option={{ parallel: { layout: 'vertical' }, parallelAxis: [{ dim: 0, name: 'a' }, { dim: 1, name: 'b' }], series: [{ type: 'parallel', data: [[1, 2]] }] }} />
    </Stack>
  )
}`, { target })
    expect(r.warnings.filter((w) => w.includes('vertical'))).toEqual([])
    expect(r.code.match(/pyreonTransposeCmds\(/g)?.length).toBe(3)
  })
})
