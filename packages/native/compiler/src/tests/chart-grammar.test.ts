// `<Chart>` with mark children is the SAME spec as `<PlotChart marks={[…]}>`:
// the native emit of the grammar form is byte-identical to the array form on
// both targets, so everything the plot host lowers (gestures, legend, theme,
// formatters) is inherited rather than re-implemented.
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const HEAD = `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
`
const DATA = `interface Month { name: string; revenue: number; cost: number; size: number }
const MONTHS: Month[] = [{ name: 'Jan', revenue: 12, cost: 8, size: 2 }, { name: 'Feb', revenue: 15, cost: 9, size: 3 }]
`
const BRUSH_FN = `function onBrush(r: BrushRange | null) {
  if (r == null) return
}
`
const GRAMMAR = `${HEAD}import { Plot, Bar, Line, Dot, Rule, Axis, Tip, Legend, Zoom, compact } from '@pyreon/charts/plot'
import type { BrushRange } from '@pyreon/charts/plot'
${DATA}export function Revenue() {
  const picked = signal(-1)
  return (
    <Stack>
      <Text>{picked()}</Text>
      <Plot data={MONTHS} x="name" height={240} theme={{ palette: ['#111111', '#222222'] }} onSelect={(i: number) => picked.set(i)}>
        <Bar y="revenue" label="Revenue" />
        <Line y={(d: Month) => d.cost} label="Cost" width={3} />
        <Dot y="revenue" r="size" label="Size" />
        <Rule y={14} label="goal" color="#b42318" />
        <Axis y format={compact} />
        <Legend />
        <Zoom navigator presets={[{ label: '1M', count: 30 }]} />
      </Plot>
    </Stack>
  )
}
`
const ARRAY = `${HEAD}import { PlotChart, bars, line, bubble, compact } from '@pyreon/charts/plot'
import type { Annotation, BrushRange } from '@pyreon/charts/plot'
${DATA}export function Revenue() {
  const picked = signal(-1)
  return (
    <Stack>
      <Text>{picked()}</Text>
      <PlotChart data={MONTHS} x={(d) => d.name} height={240} theme={{ palette: ['#111111', '#222222'] }} onSelect={(i: number) => picked.set(i)} format={compact} showLegend navigator zoomPresets={[{ label: '1M', count: 30 }]} dataZoom marks={[bars((d) => d.revenue, { label: 'Revenue' }), line((d: Month) => d.cost, { label: 'Cost', width: 3 }), bubble((d) => d.revenue, (d) => d.size, { label: 'Size' })]} annotations={[{ y: 14, label: 'goal', color: '#b42318' }]} />
    </Stack>
  )
}
`

describe('chart grammar — <Plot> children desugar to <PlotChart marks>', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: the grammar form emits BYTE-IDENTICAL code to the marks-array form`, () => {
      const g = transform(GRAMMAR, { target })
      const a = transform(ARRAY, { target })
      expect(g.warnings).toEqual(a.warnings)
      expect(g.code).toBe(a.code)
      expect(g.code).toContain('PyreonChartCanvas(')
    })
  }
  it('a long-format color channel warns BY NAME and the chart still lowers wide-format; a stray mark outside <Plot> warns', () => {
    const src = GRAMMAR.replace('x="name" height={240}', 'x="name" color="name" height={240}')
    const r = transform(src, { target: 'swift' })
    expect(r.warnings).toEqual(['<Plot color>: the long-format pivot is resolved on the web at runtime and is not lowered on native; the chart renders wide-format (one mark, one series).'])
    expect(r.code).toContain('PyreonChartCanvas(')
    const stray = transform(`${HEAD}import { Bar } from '@pyreon/charts/plot'\nexport function A() { return (<Stack><Bar y="x" /></Stack>) }`, { target: 'kotlin' })
    expect(stray.warnings).toEqual(['<Bar> only means something as a child of <Plot>; on its own it renders nothing.'])
  })
  it('<Tip> lowers to the tooltip flag, which the plot host then names as web-only; <Axis x time hidden> and a brush on <Zoom> map to their plot props', () => {
    const src = GRAMMAR.replace(DATA, DATA + BRUSH_FN).replace('<Legend />', '<Legend /><Tip crosshair /><Axis x time hidden /><Zoom brush={onBrush} inside={false} />').replace('<Zoom navigator presets={[{ label: \'1M\', count: 30 }]} />', '')
    const r = transform(src, { target: 'kotlin' })
    expect(r.warnings).toContain('<PlotChart>: `tooltip` is not lowered on native yet; the chart renders without it.')
    expect(r.code).toContain('onBrush(pyreonSel)')
    expect(r.code).toContain('showXAxis = false')
  })
})

describe('chart grammar — the toolchains accept the desugared emit', () => {
  const legs: [string, boolean, () => { ok: boolean; error?: string | undefined }][] = [
    ['swiftc (stub bundle + real engine)', isSwiftcAvailable(), () => validateSwiftWithStubs(transform(GRAMMAR, { target: 'swift' }).code)],
    ['kotlinc (stubs)', isKotlincAvailable(), () => validateKotlin(transform(GRAMMAR, { target: 'kotlin' }).code)],
  ]
  for (const [name, available, run] of legs) {
    // `it(name, { skip }, fn)` rather than `it.skipIf(...)(...)`: oxlint's
    // vitest/no-standalone-expect does not follow the chained-call form here.
    it(`${name} accepts the grammar emit`, { skip: !available }, () => {
      const r = run()
      expect(r.ok, r.error ?? '').toBe(true)
    })
  }
})
