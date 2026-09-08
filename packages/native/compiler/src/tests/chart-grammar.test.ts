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
  it('<Tip> lowers to the tooltip flag (the plot host draws it on tap); <Axis x time hidden> and a brush on <Zoom> map to their plot props', () => {
    const src = GRAMMAR.replace(DATA, DATA + BRUSH_FN).replace('<Legend />', '<Legend /><Tip crosshair /><Axis x time hidden /><Zoom brush={onBrush} inside={false} />').replace('<Zoom navigator presets={[{ label: \'1M\', count: 30 }]} />', '')
    const r = transform(src, { target: 'kotlin' })
    expect(r.warnings).not.toContain('<PlotChart>: `tooltip` is not lowered on native; the chart renders without it.')
    expect(r.code).toContain('renderTooltip(pyreonTip, pyreonTipAt,')
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

// ---------------------------------------------------------------------------
// The family marks: `<Plot>` with `<Arc>` / `<Stage>` / `<Cell>` / `<Candle>`
// desugars to the row-array host it names, byte-identical to writing that
// host directly — so the accessor inlining, the chrome, the tap and the
// entrance are inherited. `<Label>` lowers to the plot's point markers and
// `<Rule x>` to a vertical annotation.
// ---------------------------------------------------------------------------
const SLICES = `interface S { name: string; pct: number; tint: string }
const SL: S[] = [{ name: 'a', pct: 60, tint: '#111111' }, { name: 'b', pct: 40, tint: '#222222' }]
`
const ARC = `${HEAD}import { Plot, Arc, Tip, Legend } from '@pyreon/charts/plot'
${SLICES}export function Share() {
  return (<Stack><Plot data={SL} title="Share" showTitle width={240} height={200}><Arc value="pct" label="name" color={(d: S) => d.tint} innerRadius={0.5} /><Tip /><Legend /></Plot></Stack>)
}
`
const PIE = `${HEAD}import { PieChart } from '@pyreon/charts/plot'
${SLICES}export function Share() {
  return (<Stack><PieChart data={SL} title="Share" showTitle width={240} height={200} value={(d) => d.pct} label={(d) => d.name} color={(d: S) => d.tint} innerRadius={0.5} tooltip showLegend /></Stack>)
}
`
const STAGE = `${HEAD}import { Plot, Stage } from '@pyreon/charts/plot'
${SLICES}export function Steps() {
  return (<Stack><Plot data={SL} height={200}><Stage value="pct" label="name" sort="none" gap={4} /></Plot></Stack>)
}
`
const FUNNEL = `${HEAD}import { FunnelChart } from '@pyreon/charts/plot'
${SLICES}export function Steps() {
  return (<Stack><FunnelChart data={SL} height={200} value={(d) => d.pct} label={(d) => d.name} funnel={{ sort: 'none', gap: 4 }} /></Stack>)
}
`
const OBS = `interface C { hour: string; day: string; n: number }
const CELLS: C[] = [{ hour: '1', day: 'Mon', n: 2 }, { hour: '2', day: 'Mon', n: 5 }]
`
const CELL = `${HEAD}import { Plot, Cell, Axis, compact } from '@pyreon/charts/plot'
${OBS}export function Heat() {
  return (<Stack><Plot data={CELLS} width={240} height={160}><Cell x="hour" y="day" value="n" gap={2} /><Axis y format={compact} /></Plot></Stack>)
}
`
const HEAT = `${HEAD}import { HeatmapChart, compact } from '@pyreon/charts/plot'
${OBS}export function Heat() {
  return (<Stack><HeatmapChart data={CELLS} width={240} height={160} x={(d) => d.hour} y={(d) => d.day} value={(d) => d.n} gap={2} format={compact} /></Stack>)
}
`
const BARS = `interface B { day: string; o: number; h: number; l: number; c: number }
const BARS: B[] = [{ day: 'Mon', o: 1, h: 3, l: 0.5, c: 2 }, { day: 'Tue', o: 2, h: 4, l: 1.5, c: 3 }]
`
const CANDLE = `${HEAD}import { Plot, Candle } from '@pyreon/charts/plot'
${BARS}export function Periods() {
  return (<Stack><Plot data={BARS} x="day" height={180}><Candle open="o" high="h" low="l" close="c" upColor="#00ff00" /></Plot></Stack>)
}
`
const CANDLESTICK = `${HEAD}import { CandlestickChart } from '@pyreon/charts/plot'
${BARS}export function Periods() {
  return (<Stack><CandlestickChart data={BARS} x={(d) => d.day} height={180} open={(d) => d.o} high={(d) => d.h} low={(d) => d.l} close={(d) => d.c} candle={{ upColor: '#00ff00' }} /></Stack>)
}
`
const LABELS = `${HEAD}import { Plot, Bar, Label, Rule } from '@pyreon/charts/plot'
${DATA}export function Peaks() {
  return (<Stack><Plot data={MONTHS} x="name" height={200}><Bar y="revenue" /><Label at="max" text="Peak" color="#b42318" /><Label series={0} at={1} text="Feb" radius={6} /><Rule x={0.5} label="launch" /></Plot></Stack>)
}
`
const MARKERS = `${HEAD}import { PlotChart, bars } from '@pyreon/charts/plot'
${DATA}export function Peaks() {
  return (<Stack><PlotChart data={MONTHS} x={(d) => d.name} height={200} marks={[bars((d) => d.revenue)]} annotations={[{ x: 0.5, label: 'launch' }]} markers={[{ label: 'Peak', at: 'max', color: '#b42318' }, { label: 'Feb', seriesIndex: 0, atIndex: 1, radius: 6 }]} /></Stack>)
}
`

describe('chart grammar — the family marks desugar to the row-array hosts', () => {
  const pairs: [string, string, string][] = [
    ['<Arc> → <PieChart>', ARC, PIE],
    ['<Stage> → <FunnelChart>', STAGE, FUNNEL],
    ['<Cell> → <HeatmapChart>', CELL, HEAT],
    ['<Candle> → <CandlestickChart>', CANDLE, CANDLESTICK],
    ['<Label> / <Rule x> → markers / a vertical annotation', LABELS, MARKERS],
  ]
  for (const [name, grammar, direct] of pairs) {
    for (const target of ['swift', 'kotlin'] as const) {
      it(`${target}: ${name}, byte-identical to the direct host`, () => {
        const g = transform(grammar, { target })
        const d = transform(direct, { target })
        expect(g.warnings).toEqual(d.warnings)
        expect(g.code).toBe(d.code)
      })
    }
  }
  it('what does not apply to a family is reported by name and the host still lowers', () => {
    const src = `${HEAD}import { Plot, Arc, Stage, Bar, Zoom } from '@pyreon/charts/plot'
${SLICES}export function Share() {
  return (<Stack><Plot data={SL} x="name" height={200}><Arc value="pct" label="name" /><Stage value="pct" label="name" /><Bar y="pct" /><Zoom /></Plot></Stack>)
}
`
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      expect(r.warnings).toEqual([
        '<Plot x>: a pie has no x channel; it is ignored.',
        '<Plot>: one family per plot — <Stage> is ignored beside <Arc>.',
        '<Plot>: <Bar> does not apply to a pie; it is ignored.',
        '<Plot>: <Zoom> does not apply to a pie; it is ignored.',
      ])
      expect(r.code).toContain('renderPie(')
    }
  })
  const fixtures = { ARC, STAGE, CELL, CANDLE, LABELS }
  // `it(name, { skip }, fn)`, as the legs above: oxlint's no-standalone-expect does not follow the chained form.
  it('swiftc accepts every family emit', { skip: !isSwiftcAvailable() }, () => {
    for (const [name, src] of Object.entries(fixtures)) {
      const r = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
      expect(r.ok, `${name}: ${r.error ?? ''}`).toBe(true)
    }
  })
  it('kotlinc accepts every family emit', { skip: !isKotlincAvailable() }, () => {
    for (const [name, src] of Object.entries(fixtures)) {
      const r = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(r.ok, `${name}: ${r.error ?? ''}`).toBe(true)
    }
  })
})
