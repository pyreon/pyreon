import { CHART_ENGINE_DECLARED_NAMES, CHART_ENGINE_STRUCTS } from '../chart-engine-structs'
import type { DeclEmitter, MemberCallLowering, MemberCallSite } from '../call-lowering'
import type { EmitContext } from '../emit-context'
import {
  ACCESSOR_CHART_HOSTS,
  CHART_HOSTS,
  FRAME_CHART_HOSTS,
  chartActionFields,
} from '../chart-hosts'
import type { DeclIR, ExprIR, ExtDecl } from '../types'
import {
  NATIVE_COMPILER_PLUGIN_API_VERSION,
  type CompilerModule,
  type CompilerPlugin,
} from '../plugin'

const ENTRYPOINTS = new Set([
  '@pyreon/charts',
  '@pyreon/charts/engine',
  '@pyreon/charts/option',
  '@pyreon/charts/svg',
])
const ENGINE_NAMES = new Set(CHART_ENGINE_DECLARED_NAMES)

export const CHARTS_PLUGIN_NAME = '@pyreon/charts'
export const CHART_HANDLE_TYPE = 'chart-handle'

/**
 * The Swift constructor argument is the bound chart's series count, which only
 * the BODY emit knows. The declaration embeds a deferred token under this key
 * (`ctx.deferred`) and the `<PlotChart handle>` host resolves it
 * (`ctx.resolveDeferred`) once it has counted its marks. `ident` is the handle's
 * emitted identifier, so both sides agree even when the name needed escaping.
 */
export const chartHandleSeriesKey = (ident: string): string => `${CHARTS_PLUGIN_NAME}/series/${ident}`

/**
 * True for a `const chart = createChartHandle()` declaration. The `<PlotChart
 * handle={chart}>` host is element lowering that still lives in the core, so the
 * core asks whether the binding it was given IS a handle — and it learns that
 * from the component's declarations (`PluginScope.declByName`), never from a
 * plugin's private state.
 */
export function isChartHandleDecl(d: DeclIR): d is ExtDecl {
  return d.kind === 'ext' && d.plugin === CHARTS_PLUGIN_NAME && d.type === CHART_HANDLE_TYPE
}

const chartCalls = Object.freeze({
  createChartHandle: () => ({ type: CHART_HANDLE_TYPE }),
})

const dispatchWarning = (handle: string): string =>
  `<${handle}.dispatch>: native needs an inline action object with a literal \`type\` ({ type: 'select', index: 2 }); the call is skipped.`

/** `chart.dispatch({ type, … })` → the crossing reducer's full `ChartActionInput`. */
const chartHandleDispatch: MemberCallLowering = Object.freeze({
  swift(call: MemberCallSite, ctx: EmitContext) {
    const f = chartActionFields(call.args[0])
    if (f === null) {
      ctx.warn(dispatchWarning(call.receiver.name))
      return '()'
    }
    const int = (x: ExprIR | undefined): string => (x === undefined ? '-1' : `Int(${ctx.expr(x)})`)
    const dbl = (x: ExprIR | undefined, d: string): string => (x === undefined ? d : `Double(${ctx.expr(x)})`)
    const areas = f.areas === undefined ? '[]' : ctx.exprAs({ kind: 'array', element: { kind: 'typeRef', name: 'BrushArea', args: [] } }, f.areas)
    return `${ctx.ident(call.receiver.name)}.dispatch(ChartActionInput(type: ${ctx.expr(f.type!)}, index: ${int(f.index)}, series: ${int(f.series)}, start: ${dbl(f.start, '0.0')}, end: ${dbl(f.end, '1.0')}, brushType: ${f.brushType === undefined ? '""' : ctx.expr(f.brushType)}, areas: ${areas}))`
  },
  kotlin(call: MemberCallSite, ctx: EmitContext) {
    const f = chartActionFields(call.args[0])
    if (f === null) {
      ctx.warn(dispatchWarning(call.receiver.name))
      return 'Unit'
    }
    const int = (x: ExprIR | undefined): string => (x === undefined ? '-1L' : `(${ctx.expr(x)}).toLong()`)
    const dbl = (x: ExprIR | undefined, d: string): string => (x === undefined ? d : `(${ctx.expr(x)}).toDouble()`)
    const areas = f.areas === undefined ? 'listOf()' : ctx.exprAs({ kind: 'array', element: { kind: 'typeRef', name: 'BrushArea', args: [] } }, f.areas)
    return `${ctx.ident(call.receiver.name)}.dispatch(ChartActionInput(type = ${ctx.expr(f.type!)}, index = ${int(f.index)}, series = ${int(f.series)}, start = ${dbl(f.start, '0.0')}, end = ${dbl(f.end, '1.0')}, brushType = ${f.brushType === undefined ? '""' : ctx.expr(f.brushType)}, areas = ${areas}))`
  },
})

const chartHandleDecl = Object.freeze<DeclEmitter>({
  // Hashed by `moduleTag` as the `chart-handle` kind it was before it became a plugin declaration.
  legacyKind: 'chart-handle',
  swift: (d, ctx) =>
    // A handle with no chart bound to it counts zero series.
    `@State private var ${ctx.ident(d.name)} = PyreonChartHandle(seriesCount: ${ctx.deferred(chartHandleSeriesKey(ctx.ident(d.name)), '0')})`,
  kotlin: (d, ctx) => `val ${ctx.ident(d.name)} = remember { PyreonChartHandle() }`,
})

/**
 * `@pyreon/charts` on native. Runtime-provided chart structs participate in
 * inference, but are not emitted; `createChartHandle()` lowers to a
 * PyreonChartHandle — observable fields the bound `<PlotChart handle>` reads and
 * writes, and a `dispatch` that runs the crossing reducer. The `dispatch` call
 * lowers HERE (`memberCalls`); the `<PlotChart handle>` host binding is still
 * lowered by the core, which asks the component's declarations whether the name
 * is a handle and resolves the handle's deferred series count.
 */
export const chartsPlugin: CompilerPlugin<never> = Object.freeze({
  name: CHARTS_PLUGIN_NAME,
  apiVersion: NATIVE_COMPILER_PLUGIN_API_VERSION,
  builtIn: true,
  calls: chartCalls,
  decls: Object.freeze({ [CHART_HANDLE_TYPE]: chartHandleDecl }),
  memberCalls: Object.freeze({ dispatch: chartHandleDispatch }),
  unlowered: Object.freeze({
    '@pyreon/charts': Object.freeze({
      advice:
        'Most `@pyreon/charts` hosts lower to a native PyreonChartCanvas over the generated engine — PieChart/FunnelChart/GaugeChart/CandlestickChart/HeatmapChart/RadarChart/PlotChart/SankeyChart/GraphChart/TreemapChart/SunburstChart/TreeChart/RiverChart/GanttChart/PolarChart/CalendarChart/ParallelChart/BoxplotChart. MapChart lowers from a PRECOMPUTED `GeoShape[]` const — the map registry, raw GeoJSON and `geoShapes()` itself stay web and warn by name (project once on the web or in a build step). The theme lowers per chart (`theme={chartThemes.dark}` / `theme={{ palette: palettes.okabeIto }}`) and `<ChartThemeProvider mode theme>` is a compile-time scope its chart children inherit (a literal `mode` / `theme`; a reactive mode cannot be read at compile time and warns); anything else stays web — keep it in a `<Web>` branch',
      supported: Object.freeze([

        // DERIVED from the registries that actually do the lowering, rather
        // than re-typed. The two disagreed the moment a host was added:
        // `<ChordChart>` emitted a correct `renderChord(layoutChord(…))` AND
        // warned that it "has NO native lowering", because it was in
        // CHART_HOSTS and not in this list. A warning that contradicts the
        // emit beside it is worse than either being wrong alone — a reader
        // cannot tell which half to believe.
        ...Object.keys(CHART_HOSTS),
        ...Object.keys(ACCESSOR_CHART_HOSTS),
        ...Object.keys(FRAME_CHART_HOSTS),
        'MapChart',
        // A host's `visualMap={visualMap({ … })}` runs the engine's own builder at compile time (chart-hosts.ts `chartVisualMap`).
        'visualMap',
        // Theme surface: the provider is a TRANSPARENT wrapper on native (its
        // children render; per-chart `theme` props do the theming there), and
        // `chartThemes` / `palettes` are compiler-known constants a `theme`
        // literal resolves at compile time (chart-hosts.ts CHART_THEMES /
        // NAMED_PALETTES).
        'ChartThemeProvider',
        // The imperative handle lowers to a PyreonChartHandle (its `dispatch` runs the crossing reducer).
        ...Object.keys(chartCalls),
        'chartThemes',
        'palettes',
        // The grammar: <Chart> desugars to <PlotChart marks>; its mark/config children are consumed by that desugar.
        'Chart',
        'Bar',
        'Line',
        'Area',
        'Dot',
        'Rule',
        'Axis',
        'Tooltip',
        'Legend',
        'Zoom',
        'Toolbox',
        'Label',
        // The family marks: <Chart> with one of these desugars to the row-array host it names.
        'Arc',
        'Stage',
        'Cell',
        'Candle',
        // The scale switches and the binned mark: `<Scale>` desugars to spec
        // fields, `<Histogram>` warns by name in the desugar (the row
        // reshape is web-side) — neither is a missing symbol.
        'Scale',
        'Histogram',
        // The indicator marks desugar to the array form's `sma` / `ema` /
        // `trend` / `...bollinger` calls, which the emitters lower.
        'Sma',
        'Ema',
        'Trend',
        'Bollinger',
        'channel',
        // Mark + curve constructors consumed INLINE inside a `marks={[...]}`
        // array literal — the structural marks-array pass (chart-hosts.ts /
        // emit{Swift,Kotlin}.ts's PLOT_MARK_KINDS + the special-cased
        // `bubble` handling) recognizes and lowers these; without this
        // entry the generic web-only-import check ALSO flagged every one
        // of them as "has NO native lowering", duplicating (and
        // contradicting) the structural pass's own, more specific report.
        'area',
        'bars',
        'bubble',
        'groupedBars',
        'line',
        'points',
        'stackedBars',
        'waterfall',
        'stackedArea',
        'band',
        // Indicator marks — derived series over the crossing arithmetic in
        // `indicator-values.ts` (`sma` → `smaValues`).
        'sma',
        'ema',
        'trend',
        // The one that arrives as an array SPREAD, expanded to its two
        // Series by the emitters.
        'bollinger',
        'StackedArea',
        'Band',
        'smooth',
        'step',
        // Engine arithmetic that crosses verbatim (bin.ts is in ENGINE_FILES).
        'binValues',
        // Decimation, same shape (decimate-values.ts is in ENGINE_FILES). NOT
        // `lttb`: that one takes `Pt[]`, which is why the arithmetic was split
        // out of it — it genuinely stays web and must keep warning by name.
        'lttbIndices',
        'minMaxBuckets',
        // Formatter constructors — a chart's `format`/`xFormat`/`yFormat`/
        // `y2Format` prop lowers a bare name (`plain`, `compact`) or a
        // factory CALL (`fixed(2)`, `currency("$", 2)`, `percent(1)`) via
        // `swift{,Kotlin}ChartFormatter` — same false-positive shape as the
        // mark constructors above.
        'compact',
        'currency',
        'date',
        'fixed',
        'percent',
        'plain',
      ]),
    }),
  }),
  prepareIR(module: CompilerModule) {
    if (!module.imports.some((source) => ENTRYPOINTS.has(source))) return
    const declared = [...module.structs.map((s) => s.name), ...module.enums.map((e) => e.name)]
    for (const name of [...new Set(declared.filter((n) => ENGINE_NAMES.has(n)))].sort()) {
      module.warnings.push(
        `\`${name}\` is also the name of a type in the generated chart engine, and this file uses \`@pyreon/charts\` — your declaration SHADOWS the engine's, ` +
          `so the native build fails (\`invalid redeclaration of '${name}'\` in the compile gates; a type mismatch at every engine call in an app). Rename yours.`,
      )
    }
    module.structs = [...module.structs, ...CHART_ENGINE_STRUCTS]
  },
})
