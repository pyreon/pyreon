// Branch matrix for `chart-hosts.ts` — the per-host data adapters and the
// `<Chart>` grammar desugar, both reached through the real `transform()`.
//
// The adapters' whole job is to REFUSE a shape that cannot cross rather than
// emit a native view that does not exist, so nearly every spec here pairs a
// shape that lowers with the neighbouring shape that must warn BY NAME and
// emit nothing.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const swift = (src: string) => transform(src, { target: 'swift' })
const kotlin = (src: string) => transform(src, { target: 'kotlin' })

const HEAD = `import { Stack, Text } from '@pyreon/primitives'
`
/** A component whose body is the given chart element. */
const app = (body: string, decls = '', imports = '') => `${HEAD}${imports}
${decls}
export function App() {
  return (<Stack>${body}</Stack>)
}
`

// ─── CalendarChart values ────────────────────────────────────────────

describe('chart-hosts — the CalendarChart values adapter', () => {
  const cal = (values: string, decls = '') =>
    app(
      `<CalendarChart start="2026-01-01" end="2026-02-01" values={${values}} />`,
      decls,
      `import { CalendarChart } from '@pyreon/charts'`,
    )

  it('lowers an INLINE record literal to the engine list', () => {
    const out = swift(cal(`{ '2026-01-01': 3, '2026-01-02': 5 }`)).code
    expect(out).toContain('CalendarValue(date: "2026-01-01", value: 3.0)')
    expect(out).toContain('CalendarValue(date: "2026-01-02", value: 5.0)')
  })

  it('resolves a MODULE CONST holding the record', () => {
    const out = swift(cal(`VALUES`, `const VALUES = { '2026-01-01': 3 }`)).code
    expect(out).toContain('CalendarValue(date: "2026-01-01", value: 3.0)')
  })

  it('refuses a non-literal, a spread, and a non-number value — each by name', () => {
    for (const [values, decls] of [
      ['computeValues()', ''],
      ['UNKNOWN_CONST', ''],
      [`{ ...base, '2026-01-01': 3 }`, 'const base = {}'],
    ] as const) {
      const r = swift(cal(values, decls))
      expect(r.warnings.join('\n'), values).toContain('<CalendarChart values>')
      expect(r.code, values).not.toContain('CalendarValue(')
    }
    const nonNumber = swift(cal(`{ '2026-01-01': 'three' }`))
    expect(nonNumber.warnings.join('\n')).toContain('must be a number literal on native')
    expect(nonNumber.code).not.toContain('CalendarValue(')
  })
})

// ─── ParallelChart rows ──────────────────────────────────────────────

describe('chart-hosts — the ParallelChart rows adapter', () => {
  const par = (rows: string, axes = '[]', decls = '') =>
    app(
      `<ParallelChart axes={${axes}} rows={${rows}} />`,
      decls,
      `import { ParallelChart } from '@pyreon/charts'`,
    )

  it('lowers numeric rows and maps a null cell to the engine gap marker', () => {
    const out = swift(par(`[[1, 2], [3, null]]`)).code
    expect(out).toContain('1.0')
    expect(out).toContain('Double.nan')
    expect(kotlin(par(`[[1, 2], [3, null]]`)).code).toContain('Double.NaN')
  })

  it('resolves a CATEGORY cell through the axes literal, and an unknown one to the gap', () => {
    const axes = `[{ type: 'category', categories: ['a', 'b'] }, { type: 'value' }]`
    expect(swift(par(`[['b', 2]]`, axes)).code).toContain('1.0')
    expect(swift(par(`[['zzz', 2]]`, axes)).code).toContain('Double.nan')
  })

  it('refuses a category cell when the axes cannot be read', () => {
    for (const axes of [
      '[]', // an empty axes list: index 0 is unreadable
      `computeAxes()`, // not a literal
      `[{ type: 'category' }]`, // a category axis with no `categories`
      `[{ type: 'category', categories: notALiteral }]`, // categories not an array
      `[{ type: 'category', categories: [1, 2] }]`, // a non-string category
      `['nope']`, // the axis entry is not an object
    ]) {
      const r = swift(par(`[['b', 2]]`, axes))
      expect(r.warnings.join('\n'), axes).toContain('<ParallelChart rows>')
      expect(r.code, axes).not.toContain('PyreonChartCanvas')
    }
  })

  it('treats a string cell on a VALUE axis as a gap, exactly as the web does', () => {
    // `catsOf` answers `[]` for a non-category axis, so the lookup misses and
    // the cell becomes the gap marker — a refusal would be wrong here.
    const r = swift(par(`[['b', 2]]`, `[{ type: 'value' }, { type: 'value' }]`))
    expect(r.warnings.join('\n')).not.toContain('<ParallelChart rows>')
    expect(r.code).toContain('Double.nan')
  })

  it('refuses a non-array rows value, a non-array ROW, and an un-typed cell', () => {
    for (const rows of [`computeRows()`, `[1, 2]`, `[[{ a: 1 }]]`, `[[true]]`]) {
      const r = swift(par(rows))
      expect(r.warnings.join('\n'), rows).toContain('<ParallelChart rows>')
    }
  })
})

// ─── MapChart ────────────────────────────────────────────────────────

describe('chart-hosts — the MapChart adapters', () => {
  const map = (attrs: string, decls = '') =>
    app(
      `<MapChart ${attrs.includes('values') ? '' : 'values={{}}'} ${attrs} />`,
      decls,
      `import { MapChart } from '@pyreon/charts'`,
    )

  it('refuses the map REGISTRY name and raw GeoJSON, naming the crossing shape', () => {
    const byName = swift(map(`map="world"`))
    expect(byName.warnings.join('\n')).toContain('the map REGISTRY is web-only')
    const raw = swift(map(`map={{ type: 'FeatureCollection' }}`))
    expect(raw.warnings.join('\n')).toContain('raw GeoJSON does not cross')
  })

  it('hands a GeoShape[] const straight through', () => {
    const r = swift(map(`map={SHAPES}`, `const SHAPES: GeoShape[] = []`))
    expect(r.warnings.join('\n')).not.toContain('does not cross')
  })

  it('lowers an inline values RECORD and refuses a spread or a non-number value', () => {
    const ok = swift(map(`map={SHAPES} values={{ DE: 83, FR: 68 }}`, `const SHAPES: GeoShape[] = []`))
    expect(ok.code).toContain('GeoValue(region: "DE", value: 83.0)')
    const spread = swift(
      map(`map={SHAPES} values={{ ...base, DE: 83 }}`, `const SHAPES: GeoShape[] = []\nconst base = {}`),
    )
    expect(spread.warnings.join('\n')).toContain('a record literal with a spread does not cross')
    const bad = swift(map(`map={SHAPES} values={{ DE: 'lots' }}`, `const SHAPES: GeoShape[] = []`))
    expect(bad.warnings.join('\n')).toContain('must be a number literal on native')
  })

  it('passes a non-object values expression through to the generic emit', () => {
    const r = swift(map(`map={SHAPES} values={VALS}`, `const SHAPES: GeoShape[] = []\nconst VALS: GeoValue[] = []`))
    expect(r.warnings.join('\n')).not.toContain('<MapChart values>')
  })
})

// ─── the <Chart> grammar desugar ──────────────────────────────────────

const ROWS = `interface Row { name: string; v: number; w: number; lo: number; hi: number; r: number }
const ROWS: Row[] = [{ name: 'a', v: 1, w: 2, lo: 0, hi: 3, r: 1 }]`

const plot = (children: string, plotAttrs = `data={ROWS} x="name"`) =>
  app(
    `<Chart ${plotAttrs}>${children}</Chart>`,
    ROWS,
    `import { Chart, Bar, Line, Area, Dot, Band, Rule, Axis, Scale, Tip, Label, Legend, Zoom, Histogram, Arc } from '@pyreon/charts'`,
  )

describe('chart-hosts — <Chart> marks', () => {
  it('turns a STRING channel into an accessor and passes an arrow through', () => {
    expect(swift(plot(`<Bar y="v" />`)).code).toContain('.v')
    expect(swift(plot(`<Bar y={(d: Row) => d.w} />`)).code).toContain('.w')
  })

  it('picks the Bar variant from its flags', () => {
    const kind = (mark: string) => /Series\(kind: "([a-z]+)"/.exec(swift(plot(mark)).code)?.[1]
    expect(kind(`<Bar y="v" />`)).toBe('bars')
    expect(kind(`<Bar y="v" stack />`)).toBe('stacked')
    expect(kind(`<Bar y="v" group />`)).toBe('grouped')
    expect(kind(`<Bar y="v" waterfall />`)).toBe('waterfall')
    // An explicitly-false flag is NOT on.
    expect(kind(`<Bar y="v" stack={false} />`)).toBe('bars')
  })

  it('promotes a Dot with an `r` channel to a bubble, and keeps a plain Dot a dot', () => {
    // A bubble is a points series carrying per-row radii; a plain dot is not.
    expect(swift(plot(`<Dot y="v" r="r" />`)).code).toContain('bubbleRadii(')
    expect(swift(plot(`<Dot y="v" />`)).code).not.toContain('bubbleRadii(')
  })

  it('carries a mark option object only when the mark has extra attrs', () => {
    expect(swift(plot(`<Line y="v" label="L" />`)).code).toContain('label: "L"')
    expect(swift(plot(`<Line y="v" />`)).code).toContain('label: "Series 1"')
  })

  it('skips a mark with no `y` channel, by name', () => {
    const w = swift(plot(`<Line />`)).warnings.join('\n')
    expect(w).toContain('<Line>: needs a `y` channel')
  })

  it('lowers <Band> from low/high, with and without extra option fields', () => {
    expect(swift(plot(`<Band low="lo" high="hi" />`)).code).toContain('Series(kind: "band"')
    expect(swift(plot(`<Band low="lo" high="hi" color="#ffffff" />`)).code).toContain('"#ffffff"')
    const w = swift(plot(`<Band low="lo" />`)).warnings.join('\n')
    expect(w).toContain('<Band>: needs both a `low` and a `high` channel')
  })
})

describe('chart-hosts — <Chart> settings children', () => {
  it('lowers <Rule> from a y, a from/to pair, or an x — and skips an empty one', () => {
    expect(swift(plot(`<Bar y="v" /><Rule y={3} label="g" color="#111" />`)).code).toContain('"g"')
    expect(swift(plot(`<Bar y="v" /><Rule from={1} to={2} />`)).code).toContain('yFrom')
    expect(swift(plot(`<Bar y="v" /><Rule x={1} />`)).code).toMatch(/annotation/i)
    // No y / from+to / x → the annotation is dropped entirely.
    const bare = swift(plot(`<Bar y="v" /><Rule />`))
    expect(bare.code).not.toContain('yFrom')
  })

  it('lowers every <Axis> branch: x, y2 and the default y', () => {
    const x = swift(plot(`<Bar y="v" /><Axis x format={fmt} time hidden title="T" labels={LBL} />`, `data={ROWS} x="name"`))
    expect(x.code).toContain('showXAxis')
    const y2 = swift(plot(`<Bar y="v" /><Axis y2 format={fmt} domain={[0, 1]} title="T2" />`))
    expect(y2.code).toContain('y2Title')
    const y = swift(plot(`<Bar y="v" /><Axis y format={fmt} hidden title="TY" time scale="log" />`))
    expect(y.code).toContain('yTitle')
    expect(y.code).toContain('showYAxis')
  })

  it('lowers <Scale> for a time axis, a named scale, and normalize', () => {
    expect(swift(plot(`<Bar y="v" /><Scale y="time" x="time" normalize />`)).code).toContain('yTime')
    expect(swift(plot(`<Bar y="v" /><Scale y="log" />`)).code).toContain('yScale')
  })

  it('lowers <Tip>, and NAMES the crosshair a touch target cannot give', () => {
    expect(swift(plot(`<Bar y="v" /><Tip />`)).code).toContain('pyreonTip')
    expect(swift(plot(`<Bar y="v" /><Tip crosshair />`)).warnings.join('\n')).toContain(
      '`crosshair` (it is a HOVER readout',
    )
  })

  it('lowers <Label> for a numeric `at` and a named one, and skips a text-less one', () => {
    expect(swift(plot(`<Bar y="v" /><Label text="hi" at={2} series={0} color="#111" radius={3} />`)).code).toContain('atIndex')
    expect(swift(plot(`<Bar y="v" /><Label text="hi" at="a" />`)).code).toContain('"a"')
    expect(swift(plot(`<Bar y="v" /><Label />`)).warnings.join('\n')).toContain(
      '<Label>: needs a `text`',
    )
  })

  it('lowers <Legend>, and its options CHANGE the emit', () => {
    const plain = swift(plot(`<Bar y="v" /><Legend />`)).code
    const full = swift(plot(`<Bar y="v" /><Legend toggle maxRows={2} />`)).code
    expect(plain).toContain('placeLegend(')
    expect(full).toContain('placeLegend(')
    expect(full).not.toBe(plain)
    expect(full).toContain('legendToggleGroup(')
  })

  it('lowers <Zoom> including the inside=false / navigator / presets / link arms', () => {
    const none = swift(plot(`<Bar y="v" />`)).code
    const zoom = swift(plot(`<Bar y="v" /><Zoom />`)).code
    expect(zoom).toContain('pyreonZoom')
    expect(none).not.toContain('pyreonZoom')
    // `inside={false}` withholds the in-chart pan/zoom.
    expect(swift(plot(`<Bar y="v" /><Zoom inside={false} />`)).code).not.toContain('pyreonZoomAnchor')
    const full = swift(
      plot(`<Bar y="v" /><Zoom navigator presets={[{ label: '1M', count: 30 }]} link="g" />`),
    ).code
    expect(full).toContain('ZoomPreset(label: "1M"')
    expect(full).not.toBe(zoom)
  })

  it('names an UNKNOWN child rather than ignoring it silently', () => {
    const w = swift(plot(`<Bar y="v" /><Text>stray</Text>`)).warnings.join('\n')
    expect(w).toContain('child <Text> is not a mark or a chart setting')
  })

  it('names the long-format `color` pivot', () => {
    const w = swift(plot(`<Bar y="v" />`, `data={ROWS} x="name" color="name"`)).warnings.join('\n')
    expect(w).toContain('<Chart color>: the long-format pivot')
  })
})

describe('chart-hosts — <Histogram> replaces the rows', () => {
  it('substitutes binValues + a count bar, defaulting `bins` to 10', () => {
    const out = swift(plot(`<Histogram x="v" />`)).code
    expect(out).toContain('binValues(')
    expect(out).toContain('binLabel(')
    expect(swift(plot(`<Histogram x="v" bins={5} />`)).code).toContain('binValues(')
  })

  it('warns that a mark beside it reads rows the histogram replaced', () => {
    const w = swift(plot(`<Histogram x="v" /><Bar y="v" />`)).warnings.join('\n')
    expect(w).toContain('reads the ORIGINAL rows')
  })

  it('names a missing `x` and a missing `data`', () => {
    expect(swift(plot(`<Histogram />`)).warnings.join('\n')).toContain('<Histogram>: needs an `x`')
    expect(swift(plot(`<Histogram x="v" />`, `x="name"`)).warnings.join('\n')).toContain(
      '<Chart> needs a `data` attribute to bin',
    )
  })
})

describe('chart-hosts — the family grammar (<Chart><Arc/></Chart>)', () => {
  const fam = (mark: string, plotAttrs = `data={ROWS}`, extra = '') =>
    app(
      `<Chart ${plotAttrs}>${mark}${extra}</Chart>`,
      ROWS,
      `import { Chart, Arc, Bar, Tip, Legend, Axis, Zoom, Stage } from '@pyreon/charts'`,
    )

  it('routes a family mark to its host and moves the mark channels onto it', () => {
    const out = swift(fam(`<Arc value="v" label="name" />`)).code
    expect(out).toContain('PyreonChartCanvas')
    expect(swift(fam(`<Arc value="v" label="name" />`)).warnings.join('\n')).not.toContain(
      'is not a mark',
    )
  })

  it('names every cartesian plot prop that does not apply to a family host', () => {
    const w = swift(
      fam(`<Arc value="v" label="name" />`, `data={ROWS} x="name" xValue={1} color="name" horizontal showGrid`),
    ).warnings.join('\n')
    expect(w).toContain('has no x channel')
    for (const p of ['xValue', 'color', 'horizontal', 'showGrid']) {
      expect(w, p).toContain(`<Chart ${p}>: not a`)
    }
  })

  it('accepts <Tip> / <Legend> / <Axis format> beside the mark and names anything else', () => {
    const w = swift(
      fam(`<Arc value="v" label="name" />`, `data={ROWS}`, `<Tip /><Legend /><Axis y format={fmt} /><Zoom />`),
    )
    expect(w.code).toContain('PyreonChartCanvas')
    expect(w.warnings.join('\n')).toContain('<Zoom> does not apply to a pie')
  })

  it('names a SECOND family mark rather than merging the two', () => {
    const w = swift(fam(`<Arc value="v" /><Stage value="v" />`)).warnings.join('\n')
    expect(w).toContain('one family per plot')
  })

  it('routes a mark option attr into the host OPTIONS prop where the family has one', () => {
    // `Stage` (funnel) keeps its options under `funnel={{…}}`; `Arc` (pie) has
    // no options prop, so an extra attr lands straight on the host.
    const stage = swift(
      app(
        `<Chart data={ROWS}><Stage value="v" label="name" gap={7} /></Chart>`,
        ROWS,
        `import { Chart, Stage } from '@pyreon/charts'`,
      ),
    )
    const plainStage = swift(
      app(
        `<Chart data={ROWS}><Stage value="v" label="name" /></Chart>`,
        ROWS,
        `import { Chart, Stage } from '@pyreon/charts'`,
      ),
    )
    expect(stage.code).not.toBe(plainStage.code)
    expect(stage.code).toContain('FunnelOptions(gap: Double(7))')
  })
})

// ─── theme literals ──────────────────────────────────────────────────

describe('chart-hosts — chart theme literals', () => {
  const themed = (theme: string) =>
    app(
      `<PieChart data={ROWS} value={(d: Row) => d.v} theme={${theme}} />`,
      ROWS,
      `import { PieChart, chartThemes, palettes } from '@pyreon/charts'`,
    )

  it('accepts a named theme reference and an object literal', () => {
    expect(swift(themed(`chartThemes.dark`)).warnings.join('\n')).not.toContain('<PieChart theme>')
    expect(swift(themed(`{ palette: ['#111111'], fontSize: 13, label: '#222222' }`)).warnings.join('\n')).not.toContain(
      'must be a',
    )
  })

  it('names an unknown chartThemes member, falling back to the default', () => {
    expect(swift(themed(`chartThemes.neon`)).warnings.join('\n')).toContain('<PieChart theme>')
  })

  it('names a non-object theme and one carrying a spread', () => {
    expect(swift(themed(`computeTheme()`)).warnings.join('\n')).toContain(
      'only an object literal with literal fields lowers',
    )
  })

  it('names a field whose literal is the WRONG type, and an unknown field is ignored', () => {
    const w = swift(themed(`{ fontSize: 'big', label: 12, nonsense: 1 }`)).warnings.join('\n')
    expect(w).toContain('`fontSize` must be a number literal')
    expect(w).toContain('`label` must be a string literal')
    expect(w).not.toContain('nonsense')
  })

  it('names a non-palette LIST field that is not an array of string literals', () => {
    const w = swift(themed(`{ ramp: ['#111111', 2] }`)).warnings.join('\n')
    expect(w).toContain('`ramp` must be an array of string literals')
    expect(swift(themed(`{ ramp: ['#111111', '#222222'] }`)).warnings.join('\n')).not.toContain('`ramp`')
  })

  it('names a palette that is neither a non-empty string array nor a palettes.<name>', () => {
    for (const p of [`[]`, `['#111111', 2]`, `computePalette()`, `palettes.neon`]) {
      expect(swift(themed(`{ palette: ${p} }`)).warnings.join('\n'), p).toContain('<PieChart theme>')
    }
    expect(swift(themed(`{ palette: palettes.tableau10 }`)).warnings.join('\n')).not.toContain(
      '`palette`',
    )
  })
})

describe('chart-hosts — <ChartThemeProvider> scope', () => {
  const provider = (attrs: string) =>
    app(
      `<ChartThemeProvider ${attrs}><PieChart data={ROWS} value={(d: Row) => d.v} /></ChartThemeProvider>`,
      ROWS,
      `import { PieChart, ChartThemeProvider, chartThemes } from '@pyreon/charts'`,
    )

  it('accepts a literal mode and names a missing or non-literal one', () => {
    expect(swift(provider(`mode="dark"`)).warnings.join('\n')).not.toContain('<ChartThemeProvider')
    expect(swift(provider(``)).warnings.join('\n')).toContain('without a literal `mode`')
    expect(swift(provider(`mode={m}`)).warnings.join('\n')).toContain(
      'only the literal "light" / "dark" lowers',
    )
  })

  it('lays a literal `theme` over the mode, names a non-literal one, and takes a named theme whole', () => {
    expect(swift(provider(`mode="dark" theme={{ fontSize: 13 }}`)).warnings.join('\n')).not.toContain(
      'must be a',
    )
    expect(swift(provider(`mode="dark" theme={computeTheme()}`)).warnings.join('\n')).toContain(
      "only an object literal with literal fields lowers on native; the mode's theme applies",
    )
    expect(swift(provider(`mode="dark" theme={chartThemes.light}`)).warnings.join('\n')).not.toContain(
      '<ChartThemeProvider theme>',
    )
    expect(swift(provider(`mode="dark" theme={{ fontSize: 'big' }}`)).warnings.join('\n')).toContain(
      "`fontSize` must be a number literal on native; the mode's value applies",
    )
  })
})

describe('chart-hosts — the optional-options field helper', () => {
  const tree = (attrs: string) =>
    app(
      `<TreeChart data={NODE} onSelectIndex={(i: number) => pick(i)} ${attrs} />`,
      `const NODE = { name: 'root', children: [] }
function pick(i: number) {}`,
      `import { TreeChart } from '@pyreon/charts'`,
    )

  it('reads the field off the options value on BOTH targets, given or not', () => {
    // TreeChart carries `themeDefaults`, so an options value is always built —
    // which is why the helper's nil arm is unreachable from any host that uses
    // it (all three declare theme defaults). The field read is what ships.
    for (const attrs of ['', 'tree={{ symbolSize: 6 }}']) {
      expect(swift(tree(attrs)).code, attrs).toContain('(pyreonOptions).symbolSize')
      expect(kotlin(tree(attrs)).code, attrs).toContain('.symbolSize')
    }
    // …and the explicit option still reaches the emitted options literal.
    expect(swift(tree('tree={{ symbolSize: 6 }}')).code).toContain('TreeOptions(symbolSize: Double(6))')
  })
})

describe('chart-hosts — residual grammar and theme shapes', () => {
  const hist = (x: string) =>
    app(
      `<Chart data={ROWS} x="name"><Histogram x={${x}} /></Chart>`,
      ROWS,
      `import { Chart, Histogram } from '@pyreon/charts'
function pick(v: number) { return v }`,
    )

  it('INLINES a one-parameter accessor and CALLS anything else', () => {
    // A member body substitutes the param; a call body substitutes inside the
    // arguments; a free identifier is left alone.
    expect(swift(hist(`(d: Row) => d.v`)).code).toContain('pyreonChartDouble(d.v)')
    expect(swift(hist(`(d: Row) => pick(d.v)`)).code).toContain('pyreonChartDouble(pick(d.v))')
    // A free identifier in the body is NOT the parameter, so it is left alone.
    expect(swift(hist(`(d: Row) => OUTER`)).code).toContain('pyreonChartDouble(OUTER)')
    // A body that is none of identifier / member / call passes through whole.
    expect(swift(hist(`(d: Row) => 42`)).code).toContain('pyreonChartDouble(42)')
    // Not an arrow at all → an ordinary call rather than an inline.
    expect(swift(hist(`pick`)).code).toContain('pyreonChartDouble(pick(d))')
  })

  it('ignores a Plot child that is not a JSX element', () => {
    const r = swift(
      app(
        `<Chart data={ROWS} x="name">{' '}<Bar y="v" /></Chart>`,
        ROWS,
        `import { Chart, Bar } from '@pyreon/charts'`,
      ),
    )
    expect(r.code).toContain('Series(kind: "bars"')
    expect(r.warnings.join('\n')).not.toContain('is not a mark')
  })

  it('ignores a SPREAD / event attr on a family mark rather than treating it as an option', () => {
    const r = swift(
      app(
        `<Chart data={ROWS}><Arc value="v" label="name" onSelect={(i: number) => sink(i)} {...extra} /></Chart>`,
        `${ROWS}
const extra = {}
function sink(i: number) { return i }`,
        `import { Chart, Arc } from '@pyreon/charts'`,
      ),
    )
    expect(r.code).toContain('PyreonChartCanvas')
  })

  it('names a theme object literal carrying a SPREAD, on a chart and on the provider', () => {
    const chart = swift(
      app(
        `<PieChart data={ROWS} value={(d: Row) => d.v} theme={{ ...base, fontSize: 13 }} />`,
        `${ROWS}
const base = {}`,
        `import { PieChart } from '@pyreon/charts'`,
      ),
    )
    expect(chart.warnings.join('\n')).toContain('only an object literal with literal fields lowers')
    const provider = swift(
      app(
        `<ChartThemeProvider mode="dark" theme={{ ...base, fontSize: 13 }}><PieChart data={ROWS} value={(d: Row) => d.v} /></ChartThemeProvider>`,
        `${ROWS}
const base = {}`,
        `import { PieChart, ChartThemeProvider } from '@pyreon/charts'`,
      ),
    )
    expect(provider.warnings.join('\n')).toContain("the mode's theme applies")
  })
})

describe('chart-hosts — the settings children with NO options set', () => {
  const bare = (child: string) =>
    swift(
      app(
        `<Chart data={ROWS} x="name"><Bar y="v" />${child}</Chart>`,
        ROWS,
        `import { Chart, Bar, Axis, Scale, Label } from '@pyreon/charts'`,
      ),
    ).code

  it('<Axis y2> with no format / domain / title sets nothing', () => {
    const empty = bare(`<Axis y2 />`)
    expect(empty).not.toContain('y2Format')
    expect(empty).not.toContain('y2Title')
    // …while the populated one does, so the difference is the attrs.
    expect(bare(`<Axis y2 title="T2" />`)).not.toBe(empty)
  })

  it('<Axis x> and <Axis y> with no options set nothing either', () => {
    expect(bare(`<Axis x />`)).toBe(bare(`<Axis />`).replace(/\s+$/, ''))
  })

  it('<Scale> with neither `y` nor `x` is inert', () => {
    expect(bare(`<Scale />`)).toBe(bare(``))
  })

  it('<Label> with a text but no `at` still emits a marker', () => {
    const withAt = bare(`<Label text="hi" at={1} />`)
    const noAt = bare(`<Label text="hi" />`)
    expect(noAt).toContain('"hi"')
    expect(noAt).not.toBe(withAt)
  })
})
