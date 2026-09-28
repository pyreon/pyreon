// Kotlin emit — the `@pyreon/charts` hosts.
//
// These emit into a Canvas driven by the GENERATED engine, so a shape the
// emitter cannot lower has nothing to fall back on: the contract is an empty
// `Box {}` plus a warning that names the prop AND the remedy. Every spec here
// pairs a decline with the shape that must not decline, because an emit that
// quietly produced a Box would be a blank chart with a green build.
//
// The Swift twins for most of these live in `chart-indicators-native` and
// `chart-hosts`; the Kotlin halves of the DECLINE paths were the gap.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const kotlin = (src: string) => transform(src, { target: 'kotlin' })
const warn = (src: string) => kotlin(src).warnings

const HEAD = `import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
interface Row { n: string; v: number; o: number; h: number; l: number; c: number; vals: number[] }
const ROWS: Row[] = [{ n: 'a', v: 1, o: 1, h: 2, l: 0, c: 1, vals: [1, 2, 3] }]
`
const app = (imports: string, jsx: string, extra = '') =>
  `${HEAD}import { ${imports} } from '@pyreon/charts'\n${extra}export function C() { return <Stack>${jsx}</Stack> }`

describe('the accessor hosts — <PieChart> / <FunnelChart>', () => {
  it('a missing `data` and a missing required accessor are each named', () => {
    expect(warn(app('PieChart', `<PieChart value={(d) => d.v} label={(d) => d.n} />`))).toEqual([
      '<PieChart>: needs a `data` attribute on native; emitting an empty Box().',
    ])
    expect(warn(app('PieChart', `<PieChart data={ROWS} label={(d) => d.n} />`))).toEqual([
      '<PieChart>: needs a `value` accessor on native; emitting an empty Box().',
    ])
  })

  it('an ABSENT `color` is the one accessor with a fallback — the theme palette, indexed per slice', () => {
    const r = kotlin(app('PieChart', `<PieChart data={ROWS} value={(d) => d.v} label={(d) => d.n} />`))
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('[pyreonI % ')
  })

  it('an onSelect arrow with NO parameter still fires; a bare function REFERENCE is called with the hit index', () => {
    const noParam = kotlin(app(
      'PieChart',
      `<PieChart data={ROWS} value={(d) => d.v} label={(d) => d.n} onSelect={() => k.set(1)} />`,
    ).replace('return <Stack>', 'const k = signal(0); return <Stack>'))
    expect(noParam.code).toMatch(/detectTapGestures \{ pyreonTap -> \(\{ k = 1 \}\)\(\) \}/)

    const byRef = kotlin(app(
      'PieChart',
      `<PieChart data={ROWS} value={(d) => d.v} label={(d) => d.n} onSelect={pick} />`,
      'const pick = (i: number) => { }\n',
    ))
    expect(byRef.warnings).toEqual([])
    expect(byRef.code).toContain('detectTapGestures { pyreonTap -> pick(hitArc(')
  })
})

describe('the frame hosts decline by name', () => {
  it.each([
    ['BoxplotChart', `<BoxplotChart />`, '<BoxplotChart>: needs a `data` attribute on native; emitting an empty Box().'],
    ['HeatmapChart', `<HeatmapChart value={(d) => d.v} />`, '<HeatmapChart>: needs a `data` attribute on native; emitting an empty Box().'],
    ['CandlestickChart', `<CandlestickChart />`, '<CandlestickChart>: needs a `data` attribute on native; emitting an empty Box().'],
    ['GaugeChart', `<GaugeChart />`, '<GaugeChart>: needs a `value` attribute on native; emitting an empty Box().'],
    ['RadarChart', `<RadarChart axes={['a']} />`, '<RadarChart>: needs `data` and `axes` attributes on native; emitting an empty Box().'],
    ['RadarChart', `<RadarChart data={ROWS} />`, '<RadarChart>: needs `data` and `axes` attributes on native; emitting an empty Box().'],
    ['PlotChart', `<PlotChart data={ROWS} x={(d) => d.n} />`, '<PlotChart>: needs `data` and `marks` attributes on native; emitting an empty Box().'],
  ])('%s without its required attribute', (tag, jsx, expected) => {
    const r = kotlin(app(tag, jsx))
    expect(r.warnings).toContain(expected)
    expect(r.code).toContain('Box {}')
  })

  it('a per-field accessor that is missing, or is not a single-expression arrow, is named per FIELD', () => {
    const mk = 'const mk = () => (d: Row) => d.n\n'
    expect(warn(app('CandlestickChart', `<CandlestickChart data={ROWS} high={(d) => d.h} low={(d) => d.l} close={(d) => d.c} />`)))
      .toEqual(['<CandlestickChart>: needs an `open` accessor on native; emitting an empty Box().'])
    expect(warn(app('BoxplotChart', `<BoxplotChart data={ROWS} x={(d) => d.n} />`)))
      .toEqual(['<BoxplotChart>: needs a `values` or `summary` accessor on native; emitting an empty Box().'])
    expect(warn(app('HeatmapChart', `<HeatmapChart data={ROWS} x={(d) => d.n} value={(d) => d.v} />`)))
      .toEqual(['<HeatmapChart>: needs a `y` accessor on native; emitting an empty Box().'])
    // `x` is OPTIONAL on both boxplot and candlestick — but a MALFORMED one
    // still declines rather than being dropped.
    expect(warn(app('CandlestickChart', `<CandlestickChart data={ROWS} x={mk()} open={(d) => d.o} high={(d) => d.h} low={(d) => d.l} close={(d) => d.c} />`, mk)))
      .toEqual(['<CandlestickChart x>: only a single-expression arrow `(d, i) => …` lowers on native; emitting an empty Box().'])
    expect(warn(app('BoxplotChart', `<BoxplotChart data={ROWS} values={(d) => d.vals} x={mk()} />`, mk)))
      .toEqual(['<BoxplotChart x>: only a single-expression arrow `(d, i) => …` lowers on native; emitting an empty Box().'])
    expect(warn(app('HeatmapChart', `<HeatmapChart data={ROWS} x={(d) => d.n} y={(d) => d.n} value={mk()} />`, mk)))
      .toEqual(['<HeatmapChart value>: only a single-expression arrow `(d, i) => …` lowers on native; emitting an empty Box().'])
  })

  it('a grammar mark tag used OUTSIDE <Chart> renders nothing and says so', () => {
    const r = kotlin(app('Bar', `<Bar y="v" />`))
    expect(r.warnings).toContain('<Bar> only means something as a child of <Chart>; on its own it renders nothing.')
    expect(r.code).toContain('Box {}')
  })
})

describe('frame hosts with an explicit width skip the BoxWithConstraints wrapper', () => {
  const FULL = {
    Boxplot: app('BoxplotChart', `<BoxplotChart data={ROWS} values={(d) => d.vals} x={(d) => d.n} box={{ widthRatio: 0.6 }} format={(v: number) => String(v)} width={300} height={240} />`),
    Heatmap: app('HeatmapChart', `<HeatmapChart data={ROWS} x={(d) => d.n} y={(d) => d.n} value={(d) => d.v} colors={['#000', '#fff']} gap={2} width={300} onSelect={(c: number) => { }} />`),
    Candle: app('CandlestickChart', `<CandlestickChart data={ROWS} x={(d) => d.n} open={(d) => d.o} high={(d) => d.h} low={(d) => d.l} close={(d) => d.c} candle={{ widthRatio: 0.6 }} width={300} />`),
    Gauge: app('GaugeChart', `<GaugeChart value={42} width={240} trackColor="#eee" valueColor="#0a0" showValue={false} min={0} max={50} thickness={10} />`),
  }

  it('a static width becomes a fixed Modifier and the auto-width `pyreonW` binding disappears', () => {
    for (const [name, src] of Object.entries(FULL)) {
      const code = kotlin(src).code
      expect(code, name).toContain('Modifier.width((300.0).dp)'.replace('300.0', name === 'Gauge' ? '240.0' : '300.0'))
      expect(code, name).not.toContain('val pyreonW = maxWidth.value.toDouble()')
    }
  })

  it('an explicit gauge palette and a suppressed value label reach the options struct', () => {
    const code = kotlin(FULL.Gauge).code
    expect(code).toContain('trackColor = "#eee"')
    expect(code).toContain('valueColor = "#0a0"')
    // showValue={false} drops the value text command entirely.
    expect(code).not.toContain('kind = "text", fill = "#10161d"')
  })

  it('a gauge WITHOUT width keeps the auto-width wrapper and the default palette', () => {
    const code = kotlin(app('GaugeChart', `<GaugeChart value={42} />`)).code
    expect(code).toContain('val pyreonW = maxWidth.value.toDouble()')
    expect(code).toContain('trackColor = "rgba(132,150,165,0.22)"')
    expect(code).toContain('valueColor = "#0f766e"')
  })

  it('a boxplot `format` and a heatmap cell-shaped `onSelect` are each declined by name', () => {
    expect(warn(FULL.Boxplot)).toEqual([
      '<BoxplotChart format>: a formatter is not lowered on native; the axis prints plain numbers.',
    ])
    expect(warn(FULL.Heatmap)).toEqual([
      "<HeatmapChart onSelect>: the cell-shaped callback is not lowered on native; use `onSelectIndex` (the index into the grid's cells).",
    ])
  })
})

describe('the `...bollinger(…)` mark spread on Kotlin', () => {
  const BB = `import { PlotChart, bollinger } from '@pyreon/charts/engine'
interface Row { m: string; v: number }
const ROWS: Row[] = [{ m: 'Jan', v: 10 }, { m: 'Feb', v: 14 }, { m: 'Mar', v: 9 }]
export function C() {
  return <PlotChart data={ROWS} x={(d) => d.m} marks={[...bollinger((d) => d.v, 3)]} height={200} />
}`
  const swap = (from: string, to: string, extra = '') =>
    BB.replace(from, to).replace('const ROWS', `${extra}const ROWS`)

  it('the default width is 2.0; an explicit one is emitted as a Double either way it was written', () => {
    expect(kotlin(BB).code).toContain('bollingerEdge(pyreonRaw0, 3, 2.0, 1.0)')
    expect(kotlin(swap('bollinger((d) => d.v, 3)', 'bollinger((d) => d.v, 3, 1.5)')).code)
      .toContain('bollingerEdge(pyreonRaw0, 3, 1.5, 1.0)')
    // An INTEGER literal has to gain the `.0` — Kotlin refuses an Int where a
    // Double is expected.
    expect(kotlin(swap('bollinger((d) => d.v, 3)', 'bollinger((d) => d.v, 3, 3)')).code)
      .toContain('bollingerEdge(pyreonRaw0, 3, 3.0, 1.0)')
  })

  it.each([
    ['a non-literal width', 'bollinger((d) => d.v, 3, K)', 'const K = 1.5\n', "`bollinger`'s width must be a numeric literal on native"],
    ['a non-literal window', 'bollinger((d) => d.v, W)', 'const W = 3\n', '`bollinger` needs an accessor and a NUMERIC LITERAL window on native'],
    ['no window at all', 'bollinger((d) => d.v)', '', '`bollinger` needs an accessor and a NUMERIC LITERAL window on native'],
    ['an accessor that is not an inline arrow', 'bollinger(makeAcc(), 3)', 'const makeAcc = () => (d: Row) => d.v\n', 'only a single-expression arrow'],
    ['options the emitter cannot bake', "bollinger((d) => d.v, 3, 2, { label: bad })", 'const bad = [1]\n', '`label` must be a string literal on native'],
  ])('declines %s and emits nothing rather than guessing', (_why, call, extra, expected) => {
    const r = kotlin(swap('bollinger((d) => d.v, 3)', call, extra))
    expect(r.warnings.join('\n')).toContain(expected)
    expect(r.code).not.toContain('bollingerEdge(')
  })

  it('a spread of anything OTHER than bollinger is named', () => {
    const r = kotlin(swap('...bollinger((d) => d.v, 3)', '...someMarks', 'const someMarks: never[] = []\n'))
    expect(r.warnings.join('\n')).toContain('only `...bollinger(y, window)` is lowered as a spread')
  })
})

describe('<PlotChart marks> must be an inline array', () => {
  it('a marks binding that is not an array literal is refused with the shape it wants', () => {
    const r = kotlin(app('PlotChart', `<PlotChart data={ROWS} x={(d) => d.n} marks={MARKS} />`, 'const MARKS: never[] = []\n'))
    expect(r.warnings).toContain(
      '<PlotChart marks>: must be an inline array of mark calls (`[bars((d) => d.v), line((d) => d.avg)]`) on native; emitting an empty Box().',
    )
  })
})

describe('the chart Double coercion (`ktChartDouble`)', () => {
  it('an INTEGER-looking emit gains `.0`; anything else is passed through', () => {
    // Kotlin refuses an Int literal where a Double parameter is declared, so
    // `y: 0` has to reach `PyreonXYPosition` as `0.0` — while `0.5` must NOT
    // be rewritten (`0.5.0` is not a number).
    const r = kotlin(`import { createFlow } from '@pyreon/flow'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const flow = createFlow({
    nodes: [{ id: '1', position: { x: 0.5, y: 0 }, data: { label: 'Start' }, width: 120.5, height: 40 }],
    edges: [],
  })
  return (<Stack><Text>{flow.nodes().length}</Text></Stack>)
}`)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('position = PyreonXYPosition(0.5, 0.0)')
    expect(r.code).toContain('width = 120.5, height = 40.0')
  })
})
