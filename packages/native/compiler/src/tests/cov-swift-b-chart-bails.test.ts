// Branch-coverage matrices for the `@pyreon/charts` Swift host BAIL
// arms — the shapes that a host declines to lower.
//
// Every one of these is the same contract: a host that cannot lower emits
// `EmptyView()` and pushes a NAMED warning. That pairing is the whole point —
// an `EmptyView()` with no warning is a chart that silently does not exist, so
// each spec asserts BOTH halves, and each is paired with the neighbouring
// well-formed shape that must reach the real canvas instead.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

/** A component rendering one chart host, with row data in scope. */
function chart(el: string): { code: string; warnings: string[] } {
  return transform(
    `import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { RadarChart, BoxplotChart, GaugeChart } from '@pyreon/charts'
import { HeatmapChart, CandlestickChart } from '@pyreon/charts/engine'
import { PlotChart, bars, line } from '@pyreon/charts/engine'
export function C() {
  const rows = signal<{ x: string; y: number; lo: number; hi: number; vals: number[] }[]>([])
  const axes = signal<string[]>(['a', 'b'])
  const shadow = 1
  const dyn = signal<number>(6)
  return (<Stack>${el}</Stack>)
}`,
    { target: 'swift' },
  )
}

const bails = (r: { code: string; warnings: string[] }, needle: string) => {
  expect(r.code).toContain('EmptyView()')
  expect(r.warnings.some((w) => w.includes(needle)), `warnings were: ${JSON.stringify(r.warnings)}`).toBe(true)
}

describe('accessor-host bails — the shared `swiftChartAccessor` guards', () => {
  it('a MULTI-STATEMENT accessor arrow is declined by name', () => {
    bails(
      chart(
        `<RadarChart data={rows()} axes={axes()} values={(d) => { const q = d.y; return [q] }} />`,
      ),
      'only a single-expression arrow',
    )
  })

  it('an accessor with THREE params is declined (the `params.length > 2` guard)', () => {
    bails(
      chart(`<RadarChart data={rows()} axes={axes()} values={(d, i, extra) => [d.y]} />`),
      'only a single-expression arrow',
    )
  })

  it('a NON-ARROW accessor (a bare reference) is declined', () => {
    bails(
      chart(`<RadarChart data={rows()} axes={axes()} values={shadow} />`),
      'only a single-expression arrow',
    )
  })

  it('the well-formed 1-param accessor reaches the real canvas (the control)', () => {
    const { code, warnings } = chart(
      `<RadarChart data={rows()} axes={axes()} values={(d) => [d.y]} />`,
    )
    expect(code).toContain('PyreonChartCanvas(')
    expect(code).toContain('renderRadar(')
    expect(warnings.some((w) => w.includes('only a single-expression arrow'))).toBe(false)
  })
})

describe('<RadarChart> — required-prop and legend bails', () => {
  it('missing `data` OR `axes` is one named bail', () => {
    bails(chart(`<RadarChart axes={axes()} values={(d) => [d.y]} />`), 'needs `data` and `axes`')
    bails(chart(`<RadarChart data={rows()} values={(d) => [d.y]} />`), 'needs `data` and `axes`')
  })

  it('a missing `values` accessor is its own named bail', () => {
    bails(chart(`<RadarChart data={rows()} axes={axes()} />`), 'needs a `values` accessor')
  })

  it('showLegend WITHOUT a label accessor bails; WITH one it builds legend entries', () => {
    bails(
      chart(`<RadarChart data={rows()} axes={axes()} values={(d) => [d.y]} showLegend={true} />`),
      'needs a `label` accessor for the legend',
    )

    const ok = chart(
      `<RadarChart data={rows()} axes={axes()} values={(d) => [d.y]} label={(d) => d.x} showLegend={true} />`,
    )
    expect(ok.code).toContain('LegendEntry(')
  })

  it('an explicit `color` accessor replaces the palette-by-index default', () => {
    const palette = chart(`<RadarChart data={rows()} axes={axes()} values={(d) => [d.y]} />`).code
    expect(palette).toContain('pyreonI %')

    const explicit = chart(
      `<RadarChart data={rows()} axes={axes()} values={(d) => [d.y]} color={(d) => d.x} />`,
    ).code
    expect(explicit).toContain('color: pyreonD.x')
  })

  it('`rings` / `showLabels`: absent → the defaults; a literal → the literal; dynamic → the expression', () => {
    const dflt = chart(`<RadarChart data={rows()} axes={axes()} values={(d) => [d.y]} />`).code
    expect(dflt).toContain('RadarOptions(rings: 4')
    expect(dflt).toContain('showLabels: true')

    const lit = chart(
      `<RadarChart data={rows()} axes={axes()} values={(d) => [d.y]} rings={6} showLabels={false} />`,
    ).code
    expect(lit).toContain('RadarOptions(rings: 6')
    expect(lit).toContain('showLabels: false')

    // `dyn()` is a signal read, so `readStaticAttr` sees no static value and
    // the expression is emitted instead of a folded literal.
    const dyn = chart(
      `<RadarChart data={rows()} axes={axes()} values={(d) => [d.y]} rings={dyn()} showLabels={dyn() > 0} />`,
    ).code
    expect(dyn).toContain('RadarOptions(rings: dyn')
  })
})

describe('<CandlestickChart> — the per-field accessor bails', () => {
  const OHLC_ATTRS: Record<string, string> = {
    open: `open={(d) => d.lo}`,
    high: `high={(d) => d.hi}`,
    low: `low={(d) => d.lo}`,
    close: `close={(d) => d.y}`,
  }
  const OHLC = Object.values(OHLC_ATTRS).join(' ')

  it('missing `data` bails by name', () => {
    bails(chart(`<CandlestickChart ${OHLC} />`), '<CandlestickChart>: needs a `data` attribute')
  })

  it('EACH of open/high/low/close is separately required', () => {
    for (const drop of ['open', 'high', 'low', 'close']) {
      const attrs = Object.entries(OHLC_ATTRS)
        .filter(([k]) => k !== drop)
        .map(([, v]) => v)
        .join(' ')
      bails(chart(`<CandlestickChart data={rows()} ${attrs} />`), `needs an \`${drop}\` accessor`)
    }
  })

  it('a MALFORMED ohlc accessor takes the `unsupported` path, not the missing-accessor path', () => {
    const r = chart(
      `<CandlestickChart data={rows()} open={(d) => { const q = d.lo; return q }} ${OHLC_ATTRS.high} ${OHLC_ATTRS.low} ${OHLC_ATTRS.close} />`,
    )
    expect(r.code).toContain('EmptyView()')
    expect(r.warnings.some((w) => w.includes('only a single-expression arrow'))).toBe(true)
    expect(r.warnings.some((w) => w.includes('needs an `open` accessor'))).toBe(false)
  })

  it('the well-formed host renders candles, and `x` is optional (empty cats)', () => {
    const { code } = chart(`<CandlestickChart data={rows()} ${OHLC} />`)
    expect(code).toContain('let pyreonCandles: [Ohlc] =')
    expect(code).toContain('let pyreonCats: [String] = []')
    expect(code).toContain('renderCandlestickChart(')
  })

  it('an `x` accessor fills the categories', () => {
    expect(chart(`<CandlestickChart data={rows()} ${OHLC} x={(d) => d.x} />`).code).not.toContain(
      'let pyreonCats: [String] = []',
    )
  })
})

describe('<BoxplotChart> — values, format and options arms', () => {
  it('missing `data` and missing `values` are separate named bails', () => {
    bails(chart(`<BoxplotChart values={(d) => d.vals} />`), '<BoxplotChart>: needs a `data`')
    bails(chart(`<BoxplotChart data={rows()} />`), 'needs a `values` or `summary` accessor')
  })

  it('a `format` prop is a named loss, not a bail', () => {
    const r = chart(`<BoxplotChart data={rows()} values={(d) => d.vals} format={(v) => v} />`)
    expect(r.code).toContain('renderBoxplotChart(')
    expect(r.warnings.some((w) => w.includes('a formatter is not lowered on native'))).toBe(true)
  })

  it('no `box` prop → the default BoxplotOptions(); one supplied → its expression', () => {
    expect(chart(`<BoxplotChart data={rows()} values={(d) => d.vals} />`).code).toContain(
      'BoxplotOptions()',
    )
    expect(
      chart(`<BoxplotChart data={rows()} values={(d) => d.vals} box={{ width: 12 }} />`).code,
    ).toContain('width:')
  })
})

describe('<HeatmapChart> — the three mapped accessors and the onSelect decline', () => {
  const XYV_ATTRS: Record<string, string> = {
    x: `x={(d) => d.x}`,
    y: `y={(d) => d.x}`,
    value: `value={(d) => d.y}`,
  }
  const XYV = Object.values(XYV_ATTRS).join(' ')

  it('missing `data` bails; each of x/y/value is separately required', () => {
    bails(chart(`<HeatmapChart ${XYV} />`), '<HeatmapChart>: needs a `data` attribute')
    for (const drop of ['x', 'y', 'value']) {
      const attrs = Object.entries(XYV_ATTRS)
        .filter(([k]) => k !== drop)
        .map(([, v]) => v)
        .join(' ')
      bails(chart(`<HeatmapChart data={rows()} ${attrs} />`), `needs a \`${drop}\` accessor`)
    }
  })

  it('`onSelect` is declined by name in favour of onSelectIndex', () => {
    const r = chart(`<HeatmapChart data={rows()} ${XYV} onSelect={(c) => c} />`)
    expect(r.warnings.some((w) => w.includes('use `onSelectIndex`'))).toBe(true)
    // It is a DECLINE of one prop, not a bail — the chart still renders.
    expect(r.code).toContain('renderHeatChart(')
  })

  it('no `colors` prop reads the resolved theme ramp; an explicit one wins', () => {
    expect(chart(`<HeatmapChart data={rows()} ${XYV} />`).code).toContain('pyreonTheme.ramp')
    expect(chart(`<HeatmapChart data={rows()} ${XYV} colors={['#000', '#fff']} />`).code).toContain(
      '"#000"',
    )
  })
})

describe('<GaugeChart> host — value, showValue and width arms', () => {
  it('missing `value` bails by name', () => {
    bails(chart(`<GaugeChart />`), '<GaugeChart>: needs a `value` attribute')
  })

  it('showValue defaults ON and is dropped only on an explicit false', () => {
    expect(chart(`<GaugeChart value={2} />`).code).toContain('kind: "text"')
    expect(chart(`<GaugeChart value={2} showValue={false} />`).code).not.toContain('kind: "text"')
  })

  it('an explicit `width` frames directly; without one it measures via GeometryReader', () => {
    expect(chart(`<GaugeChart value={2} width={200} />`).code).toContain('.frame(width: 200')
    expect(chart(`<GaugeChart value={2} />`).code).toContain('GeometryReader { pyreonGeo in')
  })

  it('trackColor / valueColor override their literal defaults', () => {
    const dflt = chart(`<GaugeChart value={2} />`).code
    expect(dflt).toContain('"#0f766e"')
    const custom = chart(`<GaugeChart value={2} trackColor="#111" valueColor="#222" />`).code
    expect(custom).toContain('"#111"')
    expect(custom).toContain('"#222"')
  })
})

describe('<PlotChart> — the marks-shape bails', () => {
  it('missing `data` or `marks` is one named bail', () => {
    bails(chart(`<PlotChart marks={[bars((d) => d.y)]} />`), 'needs `data` and `marks`')
    bails(chart(`<PlotChart data={rows()} />`), 'needs `data` and `marks`')
  })

  it('a NON-ARRAY marks prop is declined by name', () => {
    bails(chart(`<PlotChart data={rows()} marks={shadow} />`), 'must be an inline array of mark calls')
  })

  it('a mark option object with a SPREAD is declined', () => {
    bails(
      chart(`<PlotChart data={rows()} marks={[bars((d) => d.y, { ...shadow })]} />`),
      'options must be an object literal on native',
    )
  })

  it('a NON-LITERAL mark option value is declined, naming the option', () => {
    bails(
      chart(`<PlotChart data={rows()} marks={[bars((d) => d.y, { color: shadow })]} />`),
      '`color` must be a string literal on native',
    )
  })

  it('a `curve` callback is a named loss, not a bail', () => {
    const r = chart(`<PlotChart data={rows()} marks={[line((d) => d.y, { curve: (p) => p })]} />`)
    expect(r.warnings.some((w) => w.includes('a `curve` callback is not lowered'))).toBe(true)
    expect(r.code).toContain('PyreonChartCanvas(')
  })

  it('an unrecognised mark CALL is declined by its index', () => {
    bails(chart(`<PlotChart data={rows()} marks={[shadow]} />`), 'mark 1')
  })

  it('the well-formed marks list reaches the plot renderer (the control)', () => {
    const { code } = chart(`<PlotChart data={rows()} marks={[bars((d) => d.y)]} />`)
    expect(code).toContain('PyreonChartCanvas(')
    expect(code).toContain('Series(')
  })
})
