// Branch-coverage matrices for the Swift emit's remaining tail arms: the
// empty-children degrades of the container emitters, the legacy `<PieChart>` /
// `<GaugeChart>` wrapper views, the `<PlotChart>` mark-shape declines
// (bubble / band / bollinger / error bars / zoom presets), the accessor-prop
// hosts, and the last few method-call arities.
//
// The empty-children arms all share one shape — a container with no children
// must still emit a VALID SwiftUI view rather than an empty trailing closure
// SwiftUI cannot build — so each is paired with the populated form.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const sw = (src: string) => transform(src, { target: 'swift' })

function el(jsx: string, extra = ''): { code: string; warnings: string[] } {
  return sw(
    `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
${extra}
export function App() {
  const on = signal<boolean>(false)
  const fn = () => {}
  return (<Stack>${jsx}</Stack>)
}`,
  )
}

describe('container emitters — the empty-children degrade', () => {
  it('<Layer> with no children emits an empty ZStack; with an alignment it keeps the init', () => {
    expect(el(`<Layer />`).code).toContain('ZStack {}')
    expect(el(`<Layer align="top" />`).code).toContain('ZStack(alignment:')
    expect(el(`<Layer><Text>x</Text></Layer>`).code).not.toContain('ZStack {}')
  })

  it('<Scroll> with no children emits an empty ScrollView; axis picks the init', () => {
    expect(el(`<Scroll />`).code).toContain('ScrollView {}')
    expect(el(`<Scroll axis="horizontal" />`).code).toContain('ScrollView(.horizontal)')
    expect(el(`<Scroll><Text>x</Text></Scroll>`).code).not.toContain('ScrollView {}')
  })

  it('<RouterProvider> with no children emits an empty trailing closure', () => {
    const { code } = sw(`
      export function App() {
        const router = createRouter({ routes: [] })
        return <RouterProvider router={router}></RouterProvider>
      }
    `)
    expect(code).toContain('RouterProvider(router: router) { }')
  })
})

describe('<Button> / <Toggle> — handler and disabled arms', () => {
  it('a Button with NO handler emits the empty action closure', () => {
    expect(el(`<Button>Go</Button>`).code).toContain('Button("Go") {}')
  })

  it('a Button WITH a handler emits its body', () => {
    expect(el(`<Button onPress={fn}>Go</Button>`).code).not.toContain('Button("Go") {}')
  })

  it('a Toggle with `disabled` appends the modifier; without it, nothing', () => {
    const off = el(`<Toggle value={on()} onChange={(v) => on.set(v)} />`).code
    expect(off).toContain('Toggle("", isOn: Binding(')
    expect(off).not.toContain('.disabled(')
    const on_ = el(`<Toggle value={on()} onChange={(v) => on.set(v)} disabled={true} />`).code
    expect(on_).toContain('.disabled(')
  })

  it('a Toggle with NO `value` attr bails to the generic emit', () => {
    expect(el(`<Toggle onChange={fn} />`).code).not.toContain('isOn: Binding(')
  })
})

describe('<Text> — the token-table fallback arms', () => {
  it('an UNKNOWN size token falls back to the md point size', () => {
    const known = el(`<Text size="lg">x</Text>`).code
    const unknown = el(`<Text size="enormous">x</Text>`).code
    expect(known).toContain('.font(.system(size:')
    expect(unknown).toContain('.font(.system(size:')
    expect(known).not.toEqual(unknown)
  })

  it('an UNKNOWN weight token falls back to .regular', () => {
    expect(el(`<Text weight="ultra">x</Text>`).code).toContain('.regular')
  })
})

describe('<Image> — the fit mapping and its fallback', () => {
  it('a KNOWN fit maps; an UNKNOWN one falls back to scaledToFill', () => {
    expect(el(`<Image src="logo" fit="contain" />`).code).toContain('.resizable()')
    expect(el(`<Image src="logo" fit="nonsense" />`).code).toContain('.scaledToFill()')
  })

  it('fit="none" keeps the intrinsic-size bare Image', () => {
    expect(el(`<Image src="logo" fit="none" />`).code).not.toContain('.resizable()')
  })
})

describe('<WebView onMessage> — the handler-shape arms', () => {
  it('an EMPTY-body arrow becomes the ignoring closure', () => {
    expect(el(`<WebView html="<p>x</p>" onMessage={() => {}} />`).code).toContain('{ _ in }')
  })

  it('an arrow WITH a param binds it; a bare function reference is CALLED with the message', () => {
    expect(el(`<WebView html="<p>x</p>" onMessage={(m) => fn()} />`).code).toContain('{ m in')
    expect(el(`<WebView html="<p>x</p>" onMessage={fn} />`).code).toContain('{ pyreonMsg in')
  })
})

describe('<PieChart> / <GaugeChart> — which emitter actually claims the tag', () => {
  // NOTE — `emitSwiftPieChart` / `emitSwiftGaugeChart` (the `PyreonPieChart` /
  // `PyreonGaugeChart` wrapper views) are UNREACHABLE: `isChartHostTag(tag)`
  // is tested BEFORE the `tag === 'PieChart'` / `tag === 'GaugeChart'`
  // dispatch entries, and both tags are chart-host tags, so the canvas host
  // claims them first in every source shape. These specs lock which emitter
  // wins, so a future reorder of the dispatch is visible here rather than as a
  // silently different chart.
  const pie = (attrs: string) =>
    sw(
      `import { Stack } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const rows = signal<{ v: number; n: string }[]>([])
  return (<Stack><PieChart ${attrs} /></Stack>)
}`,
    )

  it('a well-formed <PieChart> renders through the CANVAS host, not PyreonPieChart', () => {
    const { code } = pie(`data={rows()} value={(d) => d.v} label={(d) => d.n}`)
    expect(code).toContain('renderPie(')
    expect(code).not.toContain('PyreonPieChart(')
  })

  it('<GaugeChart> likewise renders through renderGauge, not PyreonGaugeChart', () => {
    const { code } = sw(
      `import { Stack } from '@pyreon/primitives'
export function App() { return (<Stack><GaugeChart value={7} /></Stack>) }`,
    )
    expect(code).toContain('renderGauge(')
    expect(code).not.toContain('PyreonGaugeChart(')
  })
})

describe('<PlotChart> — bubble / band / bollinger / error-bar / zoom declines', () => {
  const plot = (marks: string, extra = '') =>
    sw(
      `import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { PlotChart, bars, line, points, band, bubble, bollinger, sma } from '@pyreon/charts/engine'
export function C() {
  const rows = signal<{ y: number; lo: number; hi: number }[]>([])
  return (<Stack><PlotChart data={rows()} marks={${marks}} ${extra} /></Stack>)
}`,
    )

  it('`bubble` with NO radius accessor is declined by name', () => {
    const { code, warnings } = plot(`[bubble((d) => d.y)]`)
    expect(code).toContain('EmptyView()')
    expect(warnings.some((w) => w.includes('`bubble` needs a radius accessor'))).toBe(true)
  })

  it('`bubble` WITH a radius accessor builds the radii lets', () => {
    expect(plot(`[bubble((d) => d.y, (d) => d.lo)]`).code).toContain('bubbleRadii(')
  })

  it('`band` with only ONE accessor is declined by name', () => {
    const { warnings } = plot(`[band((d) => d.lo)]`)
    expect(warnings.some((w) => w.includes('`band` needs'))).toBe(true)
  })

  it('`band` with BOTH bounds emits a band series', () => {
    expect(plot(`[band((d) => d.lo, (d) => d.hi)]`).code).toContain('Series(kind: "band"')
  })

  it('`bollinger` lowers only as a SPREAD; a plain call is not a known mark', () => {
    expect(plot(`[...bollinger((d) => d.y, 20)]`).code).toContain('bollingerEdge(')
    expect(
      plot(`[bollinger((d) => d.y, 20)]`).warnings.some((w) =>
        w.includes('this mark is not lowered on native'),
      ),
    ).toBe(true)
  })

  it('a spread of something OTHER than bollinger is declined by name', () => {
    expect(
      plot(`[...bars((d) => d.y)]`).warnings.some((w) =>
        w.includes('only `...bollinger(y, window)` is lowered as a spread'),
      ),
    ).toBe(true)
  })

  it("bollinger's window must be a NUMERIC LITERAL", () => {
    expect(
      plot(`[...bollinger((d) => d.y, rows().length)]`).warnings.some((w) =>
        w.includes('NUMERIC LITERAL window'),
      ),
    ).toBe(true)
  })

  it("bollinger's WIDTH must also be a literal, and a whole one gains `.0`", () => {
    expect(plot(`[...bollinger((d) => d.y, 20, 3)]`).code).toContain('3.0')
    expect(plot(`[...bollinger((d) => d.y, 20, 2.5)]`).code).toContain('2.5')
    expect(
      plot(`[...bollinger((d) => d.y, 20, rows().length)]`).warnings.some((w) =>
        w.includes("`bollinger`'s width must be a numeric literal"),
      ),
    ).toBe(true)
  })

  it('ONE error bound alone is ignored with a named warning; BOTH emit the bounds', () => {
    const one = plot(`[bars((d) => d.y, { errorLow: (d) => d.lo })]`)
    expect(one.warnings.some((w) => w.includes('needs BOTH `errorLow` and `errorHigh`'))).toBe(true)
    expect(one.code).toContain('Series(')

    const both = plot(
      `[bars((d) => d.y, { errorLow: (d) => d.lo, errorHigh: (d) => d.hi })]`,
    )
    expect(both.code).toContain('errLow: pyreonErrLow0')
    expect(both.code).toContain('errHigh: pyreonErrHigh0')
  })

  it('NEITHER error bound binds no error `let`s at all', () => {
    // The a11y describer names `errLow`/`errHigh` unconditionally (they are
    // Series fields), so the discriminator is the hoisted binding.
    expect(plot(`[bars((d) => d.y)]`).code).not.toContain('let pyreonErrLow0')
  })

  it('`zoomPresets` must be an inline array of { label, count } literals', () => {
    const ok = plot(`[bars((d) => d.y)]`, `zoomPresets={[{ label: '1M', count: 30 }]}`)
    expect(ok.code).toContain('ZoomPreset(label: "1M", count: 30)')

    for (const bad of [
      `zoomPresets={rows()}`,
      `zoomPresets={[1]}`,
      `zoomPresets={[{ label: 1, count: 30 }]}`,
      `zoomPresets={[{ label: '1M' }]}`,
    ]) {
      const r = plot(`[bars((d) => d.y)]`, bad)
      expect(r.warnings.some((w) => w.includes('must be an inline array of `{ label, count }`')), bad).toBe(true)
    }
  })

  it('an EMPTY zoomPresets array is treated as absent, with no warning', () => {
    const r = plot(`[bars((d) => d.y)]`, `zoomPresets={[]}`)
    expect(r.warnings.some((w) => w.includes('zoomPresets'))).toBe(false)
    expect(r.code).not.toContain('ZoomPreset(')
  })

  it('an `x` accessor fills the categories; `xValue` adds the numeric axis values', () => {
    const plain = plot(`[bars((d) => d.y)]`).code
    expect(plain).toContain('let pyreonCats: [String] = []')

    const withX = plot(`[bars((d) => d.y)]`, `x={(d) => String(d.y)} xValue={(d) => d.y}`).code
    expect(withX).not.toContain('let pyreonCats: [String] = []')
    expect(withX).toContain('pyreonXValues')
  })
})

describe('accessor-prop hosts — <FunnelChart>', () => {
  const funnel = (attrs: string) =>
    sw(
      `import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { FunnelChart } from '@pyreon/charts/engine'
export function C() {
  const rows = signal<{ v: number; n: string }[]>([])
  return (<Stack><FunnelChart ${attrs} /></Stack>)
}`,
    )

  it('a missing `data` is a named bail', () => {
    const { code, warnings } = funnel(`value={(d) => d.v} label={(d) => d.n}`)
    expect(code).toContain('EmptyView()')
    expect(warnings.some((w) => w.includes('needs a `data` attribute'))).toBe(true)
  })

  it('a missing NON-palette accessor is a named bail', () => {
    const { warnings } = funnel(`data={rows()} label={(d) => d.n}`)
    expect(warnings.some((w) => w.includes('accessor on native'))).toBe(true)
  })

  it('an absent COLOR accessor falls back to the palette by index (no bail)', () => {
    const { code, warnings } = funnel(`data={rows()} value={(d) => d.v} label={(d) => d.n}`)
    expect(code).toContain('pyreonI %')
    expect(warnings.some((w) => w.includes('needs a `color` accessor'))).toBe(false)
  })

  it('an explicit `width` frames directly; without it, GeometryReader measures', () => {
    const base = `data={rows()} value={(d) => d.v} label={(d) => d.n}`
    expect(funnel(`${base} width={200}`).code).toContain('.frame(width: 200')
    expect(funnel(base).code).toContain('GeometryReader { pyreonGeo in')
  })
})

describe('method-call arities not reached elsewhere', () => {
  const m = (decl: string) =>
    sw(
      `import { Stack, Text } from '@pyreon/primitives'
import { computed, signal } from '@pyreon/reactivity'
export function App() {
  const nums = signal<number[]>([1])
  const nested = signal<number[][]>([[1]])
  const n = signal<number>(2)
${decl}
  return (<Stack><Text>x</Text></Stack>)
}`,
    ).code

  it('Array(n).fill(v) reads the count from the Array() call; arr.fill(v) uses arr.count', () => {
    expect(m(`  const a = computed(() => Array(n()).fill(0))`)).toContain(
      'Array(repeating: 0, count: n)',
    )
    expect(m(`  const a = computed(() => nums().fill(0))`)).toContain('count: nums.count')
  })

  it('fill with the WRONG arity falls through', () => {
    expect(m(`  const a = computed(() => nums().fill())`)).toContain('nums.fill()')
  })

  it('flat() with no args maps; flat(depth) falls through', () => {
    expect(m(`  const a = computed(() => nested().flat())`)).toContain('flatMap { $0 }')
    expect(m(`  const a = computed(() => nested().flat(2))`)).toContain('nested.flat(2)')
  })

  it('a 2-arg replaceAll maps; a 3-arg one falls through', () => {
    const s = `  const s2 = signal<string>('x')\n`
    expect(m(`${s}  const a = computed(() => s2().replaceAll('a', 'b'))`)).toContain(
      'replacingOccurrences(of: "a", with: "b")',
    )
    expect(m(`${s}  const a = computed(() => s2().replaceAll('a', 'b', 'c'))`)).toContain(
      's2.replaceAll(',
    )
  })

  it('sort with a 2-param EXPRESSION comparator lowers to sorted(by:) with the `< 0` wrap', () => {
    expect(m(`  const a = computed(() => nums().sort((x, y) => x - y))`)).toContain(
      'sorted(by: { x, y in (x - y) < 0 })',
    )
  })

  it('sort with a MULTI-STATEMENT comparator warns instead of lowering', () => {
    const r = sw(
      `import { Stack, Text } from '@pyreon/primitives'
import { computed, signal } from '@pyreon/reactivity'
export function App() {
  const nums = signal<number[]>([1])
  const a = computed(() => nums().sort((x, y) => { const d = x - y; return d }))
  return (<Stack><Text>x</Text></Stack>)
}`,
    )
    expect(r.warnings.some((w) => w.includes('multi-statement comparator'))).toBe(true)
    expect(r.code).not.toContain('sorted(by:')
  })
})
