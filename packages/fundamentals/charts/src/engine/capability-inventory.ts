/**
 * Versioned capability ledger for the ECharts option contract and the runtime
 * contract around it.
 *
 * `direct` means the first-party draw-list engine (`<OptionChart>` over the
 * generated engine). `hosted` means the unchanged ECharts renderer inside the
 * supported native `<WebView>` host. The two scores are deliberately separate:
 * hosted coverage never inflates the direct score.
 *
 * Every row carries a status PER TARGET (web, iOS, Android). A row is complete
 * only when it is complete on all three; a row complete on the web and
 * warning on a phone is not complete. Three rules keep the ledger honest, and
 * `capability-inventory.test.ts` enforces each of them, so the score cannot
 * drift upward on its own:
 *
 *  1. Evidence is a TEST. A source file proves nothing about behaviour, so a
 *     row may only cite `*.test.ts(x)` files or a device UI test.
 *  2. A native target other than `pending` cites at least one native-compiler
 *     test; with none, nothing on that target is proven at all.
 *  3. A live "unsupported" warning is a gap. Every such `warn()` site in the
 *     option facade carries a `// ledger: <row-id>` tag, and a tagged row can
 *     not be complete on the web. A site whose input is outside ECharts' own
 *     contract (an unregistered map, a malformed markLine) is tagged
 *     `invalid-input` instead, which never counts against a row.
 *
 *  4. The ECharts contract caps the row. Every key ECharts' own types define
 *     is read, inert, or filed under a row in `echarts-contract.ts`
 *     (enforced by `option-key-totality.test.ts`); while a row has an
 *     unmapped key, no target of it can be complete, and the keys are listed
 *     in its gaps.
 *
 * Any target short of `complete` must say why in `gaps`, in words a user can
 * act on. The headline percentages are derived from these rows by
 * `chartCapabilityScore`; nothing types a number by hand.
 */
import { ECHARTS_CONTRACT_VERSION, ECHARTS_SERIES_GAPS, ECHARTS_TOP_GAPS } from './echarts-contract'

export const CHART_CAPABILITY_CONTRACT = 'option-contract-2026-09-22.4' as const

export type ChartCapabilityArea = 'data' | 'series' | 'coordinates' | 'runtime' | 'presentation'
export type ChartCapabilityMode = 'direct' | 'hosted'
export type ChartCapabilityStatus = 'complete' | 'partial' | 'pending'
export type ChartCapabilityTarget = 'web' | 'ios' | 'android'

export const CHART_CAPABILITY_TARGETS: readonly ChartCapabilityTarget[] = ['web', 'ios', 'android']

export interface ChartCapability {
  id: string
  area: ChartCapabilityArea
  mode: ChartCapabilityMode
  /** Status on each target. */
  targets: Readonly<Record<ChartCapabilityTarget, ChartCapabilityStatus>>
  /** The weakest target's status — what the row is overall. */
  status: ChartCapabilityStatus
  /** Why a target falls short of complete; required whenever one does. */
  gaps: readonly string[]
  /** Package-relative test files. Native-compiler and device tests traverse to their packages. */
  evidence: readonly string[]
}

const RANK: Record<ChartCapabilityStatus, number> = { pending: 0, partial: 1, complete: 2 }

interface RowSpec {
  web: ChartCapabilityStatus
  /** iOS and Android together — they share one emitter pair and one engine. */
  native: ChartCapabilityStatus
  gaps?: readonly string[]
  evidence: readonly string[]
}

/**
 * The ECharts keys still unmapped for a row, from the measured contract
 * (`echarts-contract.ts`): top-level keys by name, series keys as
 * `type.key` — or by bare name when every series type shares the gap.
 */
function contractGapsFor(id: string): string[] {
  const top = Object.entries(ECHARTS_TOP_GAPS).filter(([, r]) => r === id).map(([k]) => k)
  const byKey = new Map<string, string[]>()
  for (const [type, gaps] of Object.entries(ECHARTS_SERIES_GAPS)) {
    for (const [k, r] of Object.entries(gaps)) if (r === id) byKey.set(k, [...(byKey.get(k) ?? []), type])
  }
  const typeCount = Object.keys(ECHARTS_SERIES_GAPS).length
  const series = [...byKey].map(([k, types]) => (types.length === typeCount || types.length > 3 ? `series.${k}` : types.map((t) => `${t}.${k}`).join(', ')))
  return [...top, ...series]
}

const cap = (s: ChartCapabilityStatus, max: ChartCapabilityStatus): ChartCapabilityStatus => (RANK[s] > RANK[max] ? max : s)

/**
 * A row as declared, capped by the contract: while ANY ECharts key filed
 * under the row is unmapped, no target can be complete, and the unmapped keys
 * are named in the row's gaps. The declared status is therefore "complete
 * apart from the keys the contract lists", and it takes effect only once that
 * list is empty.
 */
const row = (id: string, area: ChartCapabilityArea, mode: ChartCapabilityMode, spec: RowSpec): ChartCapability => {
  const unmapped = mode === 'direct' ? contractGapsFor(id) : []
  const ceiling: ChartCapabilityStatus = unmapped.length > 0 ? 'partial' : 'complete'
  const targets = { web: cap(spec.web, ceiling), ios: cap(spec.native, ceiling), android: cap(spec.native, ceiling) }
  const status = CHART_CAPABILITY_TARGETS.map((t) => targets[t]).reduce((a, b) => (RANK[b] < RANK[a] ? b : a))
  const gaps = [...(spec.gaps ?? []), ...(unmapped.length > 0 ? [`ECharts ${ECHARTS_CONTRACT_VERSION} keys not yet mapped (${unmapped.length}): ${unmapped.join(', ')}`] : [])]
  return { id, area, mode, targets, status, gaps, evidence: spec.evidence }
}

const NATIVE = '../../native/compiler/src/tests/'
const IOS_DEVICE = '../../../examples/native-tasks-ios/iosUITests/PyreonTasksUITests.swift'
const ANDROID_DEVICE = '../../../examples/native-tasks-android/app/src/androidTest/kotlin/com/pyreon/TasksAppInstrumentedTest.kt'
const DEVICE = [IOS_DEVICE, ANDROID_DEVICE]

/**
 * The one gap every option row shares on native today: `<OptionChart>` is
 * lowered by a COMPILE-TIME desugar, so the option has to be a literal. A
 * signal-driven or fetched option warns and renders nothing, which the web
 * handles as a matter of course.
 */
const LITERAL_ONLY =
  'native: the option is resolved at compile time, so it must be a literal; a signal-driven or fetched option warns and renders nothing'
/** Native `<OptionChart>` reads `series[0]` only. */
const FIRST_SERIES_ONLY = 'native: only series[0] is lowered'

// Built inside a PURE IIFE: every `row(...)` is a module-level call, which a
// bundler must otherwise keep in every bundle that imports this entry — the
// ledger then ships in `plot-minimal` whether or not an app reads it.
export const CHART_CAPABILITIES: readonly ChartCapability[] = /* @__PURE__ */ (() => [
  // ── data ──────────────────────────────────────────────────────────────
  row('data.option-merge', 'data', 'direct', {
    web: 'complete',
    native: 'pending',
    gaps: ['native: there is no runtime setOption, so merge, replaceMerge and notMerge have nothing to act on'],
    evidence: ['src/engine/option-composite.test.ts', 'src/engine/option-composite-merge.test.ts'],
  }),
  row('data.dataset', 'data', 'direct', {
    web: 'complete',
    native: 'partial',
    gaps: [LITERAL_ONLY],
    evidence: ['src/engine/option-layer.test.ts', NATIVE + 'chart-dataset-native.test.ts'],
  }),
  row('data.dimensions-encode', 'data', 'direct', {
    web: 'complete',
    native: 'partial',
    gaps: [LITERAL_ONLY],
    evidence: ['src/engine/option-encode-tooltip.test.ts', 'src/engine/option-layer-encode-arrays.test.ts', 'src/engine/option-family-dataset.test.ts', NATIVE + 'chart-dataset-native.test.ts'],
  }),
  row('data.transforms', 'data', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: [
      'the ECharts built-in `boxplot` and `regression` transform types are not registered (filter and sort are)',
      LITERAL_ONLY,
      'native: a transform registered with registerChartTransform lives in the page registry and does not cross',
    ],
    evidence: ['src/engine/option-transform.test.ts', NATIVE + 'chart-dataset-native.test.ts'],
  }),
  row('data.progressive-large', 'data', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: ['sampling is skipped when a series sits on a second value x axis, and some sampling spellings are named instead of honoured', LITERAL_ONLY],
    evidence: ['src/engine/option-sampling.test.ts', NATIVE + 'chart-sampling-native.test.ts'],
  }),
  row('data.empty-null', 'data', 'direct', {
    web: 'complete',
    native: 'partial',
    gaps: ['native: no native test asserts that a null datum renders as a gap'],
    evidence: ['src/engine/gaps.test.ts', 'src/engine/option-path-evidence.browser.test.tsx', NATIVE + 'chart-hosts.test.ts'],
  }),
  row('data.key-totality', 'data', 'direct', {
    web: 'pending',
    native: 'pending',
    gaps: [
      'no test enumerates the ECharts 6.1 option keys: a key the facade does not know falls to a generic "has no mapping yet" warning, so the size of that set is unmeasured',
    ],
    evidence: ['src/engine/option.test.ts'],
  }),

  // ── series ────────────────────────────────────────────────────────────
  row('series.line', 'series', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: [LITERAL_ONLY],
    evidence: ['src/engine/option-edges.test.ts', 'src/engine/echarts-differential.test.ts', NATIVE + 'chart-option-family-native.test.ts'],
  }),
  row('series.bar', 'series', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: [
      'bars lay out as ECharts columns (differential-tested) on a vertical grid; a horizontal bar chart keeps the engine gap, and two DIFFERENT `stack` groups share one accumulating stack',
      LITERAL_ONLY,
    ],
    evidence: ['src/engine/option.test.ts', 'src/engine/horizontal.test.ts', 'src/engine/echarts-differential.test.ts', NATIVE + 'chart-axes-native.test.ts'],
  }),
  row('series.pie', 'series', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: [
      'in a layered option (several pies, or a pie beside a grid) each pie is its own box, so its outside labels are cut to that box where ECharts lets them run over the whole chart',
      'a label is one line: `rich` text is not read, and `overflow: \'break\'` cuts as `truncate` does rather than wrapping',
      'native: the option pie lowers to the classic 12 o\'clock pie with percentages inside — the start/end angle, direction, min/pad angle, rose, outside labels and placement are web-only for now',
      LITERAL_ONLY,
    ],
    evidence: ['src/engine/echarts-differential.test.ts', 'src/engine/option-pie.test.ts', 'src/engine/option-family-frame.browser.test.tsx', NATIVE + 'chart-option-family-native.test.ts'],
  }),
  row('series.scatter', 'series', 'direct', {
    web: 'complete',
    native: 'partial',
    gaps: [LITERAL_ONLY],
    evidence: ['src/engine/option.test.ts', NATIVE + 'chart-option-family-native.test.ts'],
  }),
  row('series.effect-scatter', 'series', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: ['`rippleEffect` period, scale and brushType are not drawn — the ripple is one fixed shape', LITERAL_ONLY],
    evidence: ['src/engine/option.test.ts', NATIVE + 'chart-polar-scatter-native.test.ts'],
  }),
  row('series.radar', 'series', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: ['radar `shape: "circle"`, `axisName`, `splitArea` and `splitLine` styling are unmapped', LITERAL_ONLY],
    evidence: ['src/engine/option.test.ts', NATIVE + 'chart-option-family-native.test.ts'],
  }),
  row('series.tree', 'series', 'direct', {
    web: 'complete',
    native: 'partial',
    gaps: [LITERAL_ONLY],
    evidence: ['src/engine/option.test.ts', NATIVE + 'chart-option-family-native.test.ts'],
  }),
  row('series.treemap', 'series', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: ['`levels`, `upperLabel`, `visualDimension` and `childrenVisibleMin` are unmapped', LITERAL_ONLY],
    evidence: ['src/engine/option.test.ts', NATIVE + 'chart-option-family-native.test.ts'],
  }),
  row('series.sunburst', 'series', 'direct', {
    web: 'complete',
    native: 'partial',
    gaps: [LITERAL_ONLY],
    evidence: ['src/engine/option.test.ts', NATIVE + 'chart-option-family-native.test.ts'],
  }),
  row('series.boxplot', 'series', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: ['an option boxplot renders as a static SVG on the web — no hit test, tooltip or keyboard — because `<BoxplotChart>` takes raw observations, not five-number summaries', LITERAL_ONLY],
    evidence: ['src/engine/option.test.ts', NATIVE + 'chart-option-family-native.test.ts'],
  }),
  row('series.candlestick', 'series', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: ['`itemStyle.color0` / `borderColor0` are unmapped; a volume overlay needs a second series (see series.multi-series)', LITERAL_ONLY],
    evidence: ['src/engine/option.test.ts', NATIVE + 'chart-option-family-native.test.ts'],
  }),
  row('series.heatmap', 'series', 'direct', {
    web: 'complete',
    native: 'partial',
    gaps: [LITERAL_ONLY],
    evidence: ['src/engine/option.test.ts', 'src/engine/heatmap.browser.test.tsx', NATIVE + 'chart-option-family-native.test.ts'],
  }),
  row('series.graph', 'series', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: ['a `symbolSize` FUNCTION is not supported', LITERAL_ONLY],
    evidence: ['src/engine/option.test.ts', NATIVE + 'chart-option-family-native.test.ts'],
  }),
  row('series.sankey', 'series', 'direct', {
    web: 'complete',
    native: 'partial',
    gaps: [LITERAL_ONLY],
    evidence: ['src/engine/option-orient.test.ts', NATIVE + 'chart-orient-native.test.ts'],
  }),
  row('series.funnel', 'series', 'direct', {
    web: 'complete',
    native: 'partial',
    gaps: [LITERAL_ONLY],
    evidence: ['src/engine/option.test.ts', NATIVE + 'chart-option-family-native.test.ts'],
  }),
  row('series.gauge', 'series', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: [
      'a `path://` or `image://` pointer or anchor icon draws the default needle / circle (with a warning); `roundRect` draws square',
      'the detail box has no `borderRadius` or `rich` text; `valueAnimation` counts nothing up',
      'native: the option gauge lowers to the half-circle track — the dial is web-only for now',
      LITERAL_ONLY,
    ],
    evidence: ['src/engine/echarts-differential.test.ts', 'src/engine/option-gauge.test.ts', NATIVE + 'chart-option-family-native.test.ts'],
  }),
  row('series.river', 'series', 'direct', {
    web: 'complete',
    native: 'partial',
    gaps: [LITERAL_ONLY],
    evidence: ['src/engine/option.test.ts', NATIVE + 'chart-option-family-native.test.ts'],
  }),
  row('series.custom', 'series', 'direct', {
    web: 'complete',
    native: 'pending',
    gaps: ['native: `renderItem` is a function run per datum at render time, and no native path lowers it'],
    evidence: ['src/engine/custom-series.test.ts'],
  }),
  row('series.map', 'series', 'direct', {
    web: 'complete',
    native: 'pending',
    gaps: ['native: an `<OptionChart>` map series does not lower (the typed `<MapChart>` host does, from a precomputed GeoShape[])'],
    evidence: ['src/engine/geo-roam.test.ts', 'src/engine/geo.browser.test.tsx'],
  }),
  row('series.lines', 'series', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: ['the trail head is always a circle, and effect keys outside show/period/trailLength/color/symbolSize/loop are ignored with a warning', LITERAL_ONLY],
    evidence: ['src/engine/lines-series.test.ts', NATIVE + 'chart-lines-native.test.ts', IOS_DEVICE],
  }),
  row('series.pictorial-bar', 'series', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: ['percent strings for symbolSize and symbolOffset are not supported, and path:// / image:// symbols draw as a rect', LITERAL_ONLY],
    evidence: ['src/engine/pictorial.test.ts', 'src/engine/option-edges.test.ts', NATIVE + 'chart-pictorial-native.test.ts'],
  }),
  row('series.multi-series', 'series', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: [
      'a family series cannot share ONE grid with cartesian series (candles with moving-average lines on the same axes); on separate grids, or as separate layers, it can',
      FIRST_SERIES_ONLY,
    ],
    evidence: ['src/engine/option-layers.test.ts', 'src/engine/option-layers.browser.test.tsx', 'src/engine/option-family-frame.browser.test.tsx', 'src/engine/option.test.ts', NATIVE + 'chart-option-family-native.test.ts'],
  }),
  row('series.chord', 'series', 'direct', {
    web: 'complete',
    native: 'partial',
    gaps: [LITERAL_ONLY],
    evidence: ['src/engine/chord.test.ts', NATIVE + 'chart-chord-native.test.ts'],
  }),
  row('series.parallel', 'series', 'direct', {
    web: 'complete',
    native: 'partial',
    gaps: [LITERAL_ONLY],
    evidence: ['src/engine/parallel.test.ts', NATIVE + 'chart-orient-native.test.ts'],
  }),
  row('series.extensions', 'series', 'hosted', {
    web: 'complete',
    native: 'partial',
    gaps: ['native: the WebView bridge is emit- and compile-proven only; no device test drives it'],
    evidence: ['src/tests/webview.test.ts', 'src/webview.browser.test.tsx', NATIVE + 'chart-webview-native.test.ts'],
  }),

  // ── coordinates & components ──────────────────────────────────────────
  row('coordinates.grid', 'coordinates', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: [
      'ECharts 6\'s default grid and its `outerBoundsMode: \'auto\'` growth are matched (differential-tested); a custom `outerBounds` rect, `outerBoundsContain` and the 25% clamp are not read, and the growth follows the axis labels, not the axis names',
      LITERAL_ONLY,
    ],
    evidence: ['src/engine/option-composite.test.ts', 'src/engine/option-grid.test.ts', 'src/engine/echarts-differential.test.ts', NATIVE + 'chart-axes-native.test.ts'],
  }),
  row('coordinates.title', 'coordinates', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: [
      'a title\'s box has no `borderRadius` or shadow, its text no `rich` styles or font family, and `triggerEvent` raises no click event',
      LITERAL_ONLY,
    ],
    evidence: ['src/engine/title-edges.test.ts', 'src/engine/option-title.test.ts', 'src/engine/echarts-differential.test.ts', 'src/engine/option-title-link.browser.test.tsx', NATIVE + 'chart-chrome-native.test.ts'],
  }),
  row('coordinates.legend', 'coordinates', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: [
      '`type: "scroll"` paging and the `selector` buttons are not drawn',
      'series `legendHoverLink` (hovering an entry emphasises its series) is not honoured',
      'a family option chart (pie, funnel, …) draws its host\'s own legend, which a click does not toggle; a multi-grid option\'s legend does not toggle either',
      LITERAL_ONLY,
    ],
    evidence: ['src/engine/legend-toggle.test.ts', 'src/engine/legend-scroll.test.ts', 'src/engine/option-legend.test.ts', 'src/engine/option-legend.browser.test.tsx', 'src/engine/echarts-differential.test.ts', 'src/engine/option-grid.test.ts', NATIVE + 'chart-legend-change-native.test.ts'],
  }),
  row('coordinates.tooltip', 'coordinates', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: [
      '`appendToBody` / `appendTo`, the richText render mode and `displayMode: "multipleByCoordSys"` are named and not honoured',
      'a boxplot or single-axis option chart renders as SVG, so the option\'s tooltip does not reach it (every other family applies `formatter`, `position`, `trigger` and the series\' own `tooltip` through its host)',
      LITERAL_ONLY,
    ],
    evidence: ['src/engine/option-tooltip.test.ts', 'src/engine/tooltip-format.test.ts', 'src/engine/tooltip-html.test.ts', 'src/engine/option-tooltip.browser.test.tsx', 'src/engine/family-tooltip.test.ts', 'src/engine/option-family-interaction.browser.test.tsx', NATIVE + 'chart-plot-tooltip-native.test.ts'],
  }),
  row('coordinates.axis-pointer', 'coordinates', 'direct', {
    web: 'partial',
    native: 'pending',
    gaps: [
      '`tooltip.axisPointer` (line / shadow / cross with axis labels) draws on a vertical category axis; the top-level `axisPointer` component, `xAxis.axisPointer` and horizontal (category-on-y) charts are not covered',
      'native: the axis pointer follows a hover, which a touch target does not have',
    ],
    evidence: ['src/engine/axis-pointer.test.ts', 'src/engine/option-tooltip.browser.test.tsx'],
  }),
  row('coordinates.aria', 'coordinates', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: ['only `aria.decal.show` is read; `aria.enabled` and the `aria.label` templates are ignored (the engine writes its own description)', LITERAL_ONLY],
    evidence: ['src/engine/option-fills-marks.test.ts', NATIVE + 'chart-decals-native.test.ts'],
  }),
  row('coordinates.polar', 'coordinates', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: ['a `custom` series on the polar coordinate is skipped with a warning', LITERAL_ONLY],
    evidence: ['src/engine/polar.test.ts', NATIVE + 'chart-polar-scatter-native.test.ts'],
  }),
  row('coordinates.calendar', 'coordinates', 'direct', {
    web: 'complete',
    native: 'partial',
    gaps: [LITERAL_ONLY],
    evidence: ['src/engine/option-orient.test.ts', NATIVE + 'chart-orient-native.test.ts'],
  }),
  row('coordinates.parallel', 'coordinates', 'direct', {
    web: 'complete',
    native: 'partial',
    gaps: [LITERAL_ONLY],
    evidence: ['src/engine/option-orient.test.ts', NATIVE + 'chart-orient-native.test.ts'],
  }),
  row('coordinates.single-axis', 'coordinates', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: ['an option single-axis chart renders as a static SVG on the web (no interactive host)', LITERAL_ONLY, 'native: SingleAxisChart has no device test'],
    evidence: ['src/engine/single-axis.test.ts', NATIVE + 'chart-option-family-native.test.ts'],
  }),
  row('coordinates.axes', 'coordinates', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: [
      'a log scale applies to the first y axis only',
      'two y axes cannot share a side (ECharts offsets them); a third x axis is ignored',
      'axis keys outside the mapped set are ignored with a warning; an axis label formatter takes a function or the {value} template only; both axes read `axisLabel.margin`, `inside` and `rotate` (label anchors differential-tested); the x axis also `interval` (a category axis thins by ECharts\' calculateCategoryInterval); a second or extra y axis keeps the default margin',
      'axis lines, ticks and split lines follow ECharts\' auto rule and `axisLine` / `axisTick` / `splitLine` styles (differential-tested); `axisLine.onZero` (the x line on the value zero), `minorTick`, `minorSplitLine` and `splitArea` are not drawn, and the second y axis\'s split lines take the first\'s style',
      'the y axes and a value X axis tick as ECharts does (differential-tested); a time axis still uses the engine\'s own ticks, and interval, minInterval and maxInterval are not read',
      LITERAL_ONLY,
    ],
    evidence: ['src/engine/option-axes.test.ts', 'src/engine/option-axes-mapping.test.ts', NATIVE + 'chart-axes-native.test.ts', 'src/engine/option-boundary-gap.test.ts', 'src/engine/echarts-differential.test.ts'],
  }),
  row('coordinates.visual-map', 'coordinates', 'direct', {
    web: 'complete',
    native: 'partial',
    gaps: [LITERAL_ONLY],
    evidence: ['src/engine/visual-strip.test.ts', 'src/engine/visual-map.test.ts', 'src/engine/heatmap.browser.test.tsx', NATIVE + 'chart-visual-map-native.test.ts', ...DEVICE],
  }),
  row('coordinates.graphic', 'coordinates', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: ['graphic `image` elements are skipped (the draw list has no bitmap command)', LITERAL_ONLY],
    evidence: ['src/engine/graphic-shapes.test.ts', 'src/engine/cov-core-option-layer.test.ts', NATIVE + 'chart-graphic-native.test.ts'],
  }),
  row('coordinates.mark-point', 'coordinates', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: ['markPoint statistics run over the y values only (`valueDim` is ignored)', LITERAL_ONLY],
    evidence: ['src/engine/option-marks.test.ts', NATIVE + 'chart-marks-native.test.ts'],
  }),
  row('coordinates.mark-line', 'coordinates', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: ['markLine data outside average/max/min/median, xAxis, yAxis and point-to-point is skipped', LITERAL_ONLY],
    evidence: ['src/engine/option-marks.test.ts', 'src/engine/option-boundary-gap.test.ts', NATIVE + 'chart-marks-native.test.ts'],
  }),
  row('coordinates.mark-area', 'coordinates', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: ['a markArea bound by a statistic (`type: "min"`) or a coord pair is skipped; only xAxis (a category name or a number) and yAxis bounds draw', LITERAL_ONLY],
    evidence: ['src/engine/option.test.ts', 'src/engine/option-boundary-gap.test.ts', NATIVE + 'chart-option-family-native.test.ts'],
  }),
  row('coordinates.geo', 'coordinates', 'direct', {
    web: 'partial',
    native: 'pending',
    gaps: [
      '`center`, `aspectScale`, `layoutCenter` and `layoutSize` are ignored (the map fits the box), and graph/custom series on the geo are skipped',
      'native: an `<OptionChart>` geo option does not lower (the typed `<MapChart>` host does)',
    ],
    evidence: ['src/engine/geo-roam.test.ts', 'src/engine/geo-series.test.ts', 'src/engine/geo.browser.test.tsx'],
  }),
  row('coordinates.data-zoom', 'coordinates', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: ['only the category x axis zooms, and only the first x axis; a y-axis or value-axis dataZoom is ignored with a warning', LITERAL_ONLY],
    evidence: ['src/engine/option-zoom.test.ts', 'src/engine/zoom.browser.test.tsx', NATIVE + 'chart-option-datazoom-native.test.ts', ...DEVICE],
  }),
  row('coordinates.timeline', 'coordinates', 'direct', {
    web: 'complete',
    native: 'partial',
    gaps: [LITERAL_ONLY],
    evidence: ['src/engine/timeline-strip.test.ts', 'src/engine/option-chart.browser.test.tsx', NATIVE + 'chart-option-timeline-native.test.ts', ...DEVICE],
  }),
  row('coordinates.toolbox', 'coordinates', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: ['a custom tool (`myTool*`) and features outside the mapped set are skipped, and the box zoom ignores its y axis', LITERAL_ONLY],
    evidence: ['src/engine/toolbox.test.ts', 'src/engine/option-toolbox.test.ts', 'src/engine/toolbox.browser.test.tsx', NATIVE + 'chart-toolbox-native.test.ts', ...DEVICE],
  }),
  row('coordinates.brush', 'coordinates', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: ['out-of-brush visuals other than colorAlpha and every in-brush visual are ignored; brush binds the one grid only', LITERAL_ONLY],
    evidence: ['src/engine/brush-area.test.ts', 'src/engine/option-brush.test.ts', 'src/engine/brush-area.browser.test.tsx', NATIVE + 'chart-brush-native.test.ts', ...DEVICE],
  }),
  row('coordinates.matrix', 'coordinates', 'direct', {
    web: 'pending',
    native: 'pending',
    gaps: ['the ECharts 6 `matrix` coordinate system (a grid of cells series are placed into) is not implemented'],
    evidence: ['src/engine/option.test.ts'],
  }),
  row('coordinates.thumbnail', 'coordinates', 'direct', {
    web: 'pending',
    native: 'pending',
    gaps: ['the ECharts 6 `thumbnail` component (an overview of a roamed chart) is not implemented'],
    evidence: ['src/engine/option.test.ts'],
  }),
  row('coordinates.media', 'coordinates', 'direct', {
    web: 'pending',
    native: 'pending',
    gaps: ['`media` responsive queries are not read at all'],
    evidence: ['src/engine/option.test.ts'],
  }),

  // ── runtime ───────────────────────────────────────────────────────────
  row('runtime.init-dispose-resize', 'runtime', 'hosted', {
    web: 'complete',
    native: 'partial',
    gaps: ['native: the WebView bridge is emit- and compile-proven only; no device test drives it'],
    evidence: ['src/webview.browser.test.tsx', NATIVE + 'chart-webview-native.test.ts'],
  }),
  row('runtime.option-updates', 'runtime', 'hosted', {
    web: 'complete',
    native: 'partial',
    gaps: ['native: the WebView bridge is emit- and compile-proven only; no device test drives it'],
    evidence: ['src/webview.browser.test.tsx', NATIVE + 'chart-webview-native.test.ts'],
  }),
  row('runtime.actions', 'runtime', 'hosted', {
    web: 'complete',
    native: 'partial',
    gaps: ['native: the WebView bridge is emit- and compile-proven only; no device test drives it'],
    evidence: ['src/webview.browser.test.tsx', NATIVE + 'chart-webview-native.test.ts'],
  }),
  row('runtime.events', 'runtime', 'hosted', {
    web: 'complete',
    native: 'partial',
    gaps: ['native: the WebView bridge is emit- and compile-proven only; no device test drives it'],
    evidence: ['src/webview.browser.test.tsx', NATIVE + 'chart-webview-native.test.ts'],
  }),
  row('runtime.connected-groups', 'runtime', 'hosted', {
    web: 'complete',
    native: 'partial',
    gaps: ['native: the WebView bridge is emit- and compile-proven only; no device test drives it'],
    evidence: ['src/webview-group.browser.test.tsx', NATIVE + 'chart-webview-native.test.ts'],
  }),
  row('runtime.loading', 'runtime', 'hosted', {
    web: 'complete',
    native: 'partial',
    gaps: ['native: the WebView bridge is emit- and compile-proven only; no device test drives it'],
    evidence: ['src/webview.browser.test.tsx', NATIVE + 'chart-webview-native.test.ts'],
  }),
  row('runtime.themes', 'runtime', 'hosted', {
    web: 'complete',
    native: 'partial',
    gaps: ['native: the WebView bridge is emit- and compile-proven only; no device test drives it'],
    evidence: ['src/tests/webview.test.ts', NATIVE + 'chart-webview-native.test.ts'],
  }),
  row('runtime.maps', 'runtime', 'hosted', {
    web: 'complete',
    native: 'partial',
    gaps: ['native: the WebView bridge is emit- and compile-proven only; no device test drives it'],
    evidence: ['src/tests/webview.test.ts', NATIVE + 'chart-webview-native.test.ts'],
  }),
  row('runtime.renderer-options', 'runtime', 'hosted', {
    web: 'complete',
    native: 'partial',
    gaps: ['native: the WebView bridge is emit- and compile-proven only; no device test drives it'],
    evidence: ['src/tests/webview.test.ts', NATIVE + 'chart-webview-native.test.ts'],
  }),
  row('runtime.extension-registration', 'runtime', 'hosted', {
    web: 'complete',
    native: 'partial',
    gaps: ['native: the WebView bridge is emit- and compile-proven only; no device test drives it'],
    evidence: ['src/tests/webview.test.ts', NATIVE + 'chart-webview-native.test.ts'],
  }),
  row('runtime.option-updates', 'runtime', 'direct', {
    web: 'complete',
    native: 'pending',
    gaps: ['native: the option is fixed at compile time, so there is nothing to update'],
    evidence: ['src/engine/option-chart.test.ts', 'src/engine/option-chart-states.test.tsx'],
  }),
  row('runtime.actions', 'runtime', 'direct', {
    web: 'complete',
    native: 'partial',
    gaps: ['native: the dispatch handle lowers for the typed hosts; `<OptionChart handle>` actions are proven by emit only'],
    evidence: ['src/engine/chart-actions.test.ts', 'src/engine/link-dispatch.test.ts', 'src/engine/chart-actions.browser.test.tsx', 'src/engine/events-actions.browser.test.tsx', NATIVE + 'chart-handle-native.test.ts'],
  }),
  row('runtime.events', 'runtime', 'direct', {
    web: 'complete',
    native: 'partial',
    gaps: ['native: a tap reports onSelectIndex; onClick, onDoubleClick, onContextMenu, onHighlight and onRendered are named and dropped'],
    evidence: ['src/engine/events-actions.browser.test.tsx', NATIVE + 'chart-selection-native.test.ts', ...DEVICE],
  }),
  row('runtime.connected-groups', 'runtime', 'direct', {
    web: 'complete',
    native: 'pending',
    gaps: ['native: `link` couples charts through a DOM-side controller and is named and dropped'],
    evidence: ['src/engine/link.browser.test.tsx', 'src/engine/link-dispatch.test.ts', 'src/engine/option-path-evidence.browser.test.tsx'],
  }),
  row('runtime.resize', 'runtime', 'direct', {
    web: 'complete',
    native: 'partial',
    gaps: ['native: the canvas lays out in its frame, but no native test changes the frame and asserts a re-layout'],
    evidence: ['src/engine/canvas-host.test.tsx', 'src/engine/option-path-evidence.browser.test.tsx', NATIVE + 'chart-hosts.test.ts'],
  }),

  // ── presentation ──────────────────────────────────────────────────────
  row('presentation.labels-rich-text', 'presentation', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: [
      'a rich segment takes colour and size only (no weight, background, padding); formatter placeholders beyond {a} {b} {c} {d} are left as written',
      'bar labels take ECharts\' position, distance and automatic fill and halo (differential-tested); a line or scatter label keeps the engine\'s placement above the point, and `label.rotate` / `offset` / `align` are not read',
      'native: SwiftUI text has no stroke, so the halo is the text drawn at eight offsets under the fill; Compose strokes it',
      LITERAL_ONLY,
    ],
    evidence: ['src/engine/option-labels.test.ts', 'src/engine/option-label-formatter.test.ts', 'src/engine/echarts-differential.test.ts', NATIVE + 'chart-labels-native.test.ts'],
  }),
  row('presentation.states', 'presentation', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: [
      '`emphasis.focus` ancestor/descendant/adjacency, `select.disabled`, `select.lineStyle`/`areaStyle` and `blur.label` are named and ignored',
      'family option charts (pie, sankey, …) have no select or blur state: their `select`, `blur`, `selectedMode` and `selectedMap` are gaps',
      'native: the hover half of emphasis does not cross (a tap pins instead)',
      LITERAL_ONLY,
    ],
    evidence: ['src/engine/emphasis.test.ts', 'src/engine/states-render.test.ts', 'src/engine/option-states.test.ts', 'src/engine/option-chart-states.test.tsx', 'src/engine/states.browser.test.tsx', 'src/engine/option-selected-map.test.ts', 'src/engine/option-selected-map.browser.test.tsx', NATIVE + 'chart-states-native.test.ts'],
  }),
  row('presentation.symbols', 'presentation', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: ['`path://`, `image://`, `pin` and `arrow` symbols draw as a circle', LITERAL_ONLY],
    evidence: ['src/engine/option-symbols.test.ts', 'src/engine/echarts-differential.test.ts', NATIVE + 'chart-symbols-native.test.ts'],
  }),
  row('presentation.gradients-patterns', 'presentation', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: ['a line STROKE cannot be an image pattern (fills can)', LITERAL_ONLY],
    evidence: ['src/engine/option-gradients.test.ts', 'src/engine/svg-path.test.ts', NATIVE + 'chart-gradients-native.test.ts'],
  }),
  row('presentation.decals', 'presentation', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: ['`path://` and `image://` decal symbols are not drawn', LITERAL_ONLY],
    evidence: ['src/engine/pattern-marks.test.ts', 'src/engine/option-fills-marks.test.ts', NATIVE + 'chart-decals-native.test.ts', ...DEVICE],
  }),
  row('presentation.layering', 'presentation', 'direct', {
    web: 'partial',
    native: 'pending',
    gaps: [
      '`blendMode` does not composite series (they paint source-over)',
      'a family layer always sits over the cartesian grid, whatever the two `z` values say; stacked and grouped bars keep their group\'s place in the paint order',
      'native: the engine paints by `ChartSpec.drawOrder`, but the native option path does not compute it from `z` / `zlevel`',
    ],
    evidence: ['src/engine/option-z.test.ts', 'src/engine/option-family-interaction.browser.test.tsx'],
  }),
  row('presentation.palette', 'presentation', 'direct', {
    web: 'complete',
    native: 'partial',
    gaps: [LITERAL_ONLY],
    evidence: ['src/engine/presets.test.ts', 'src/engine/theme.test.ts', 'src/engine/option-family-colorby.test.ts', NATIVE + 'chart-theme-native.test.ts'],
  }),
  row('presentation.theme', 'presentation', 'direct', {
    web: 'complete',
    native: 'partial',
    gaps: [LITERAL_ONLY],
    evidence: ['src/engine/theme.test.ts', 'src/engine/theme-locale.test.ts', NATIVE + 'chart-theme-native.test.ts'],
  }),
  row('presentation.animation', 'presentation', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: [
      'per-datum FUNCTION durations and delays (ECharts\' staggered entrance) fall back to one timeline, and series that ask for different timings share the first one',
      '`stateAnimation` (the hover / select state transition) and pie / sunburst `animationType` are not played',
      'native: the easing table and the option\'s timings do not cross yet (the native entrance is the fixed cubic ease-out)',
      LITERAL_ONLY,
    ],
    evidence: ['src/engine/easing.test.ts', 'src/engine/animation-option.test.ts', 'src/engine/option-animation.browser.test.tsx', 'src/engine/cmd-tween.test.ts', NATIVE + 'native-chart-transition-parity.test.ts', NATIVE + 'chart-entrance-native.test.ts'],
  }),
  row('presentation.universal-transition', 'presentation', 'direct', {
    web: 'complete',
    native: 'partial',
    gaps: [LITERAL_ONLY],
    evidence: ['src/engine/cmd-tween.test.ts', 'src/engine/universal-transition.browser.test.tsx', 'src/engine/option-family-universal.browser.test.tsx', NATIVE + 'native-chart-transition-parity.test.ts', ...DEVICE],
  }),
  row('presentation.locale', 'presentation', 'direct', {
    web: 'partial',
    native: 'partial',
    gaps: ['no ECharts locale packs ship; a locale is registered by hand with registerLocale', LITERAL_ONLY],
    evidence: ['src/engine/theme-locale.test.ts', NATIVE + 'chart-locale-native.test.ts'],
  }),
  row('presentation.rtl', 'presentation', 'direct', {
    web: 'complete',
    native: 'complete',
    evidence: ['src/engine/rtl.test.ts', 'src/engine/rtl.browser.test.tsx', 'src/engine/option-path-evidence.browser.test.tsx', NATIVE + 'chart-rtl-native.test.ts', NATIVE + 'native-chart-mirror-parity.test.ts'],
  }),
  row('presentation.export-snapshot', 'presentation', 'direct', {
    web: 'complete',
    native: 'partial',
    gaps: ['native: saveAsImage hands back a PNG; the SVG export is named and dropped'],
    evidence: ['src/engine/svg.test.ts', 'src/engine/toolbox.browser.test.tsx', 'src/engine/option-path-evidence.browser.test.tsx', NATIVE + 'chart-toolbox-native.test.ts', ...DEVICE],
  }),
  row('presentation.a11y-keyboard', 'presentation', 'direct', {
    web: 'complete',
    native: 'pending',
    gaps: ['native: `keyboard` is named and dropped — the canvas is not focusable and there are no accessibility actions to step through datums'],
    evidence: ['src/engine/interaction.browser.test.tsx', 'src/engine/host-sweep.browser.test.tsx'],
  }),
  row('presentation.a11y-table', 'presentation', 'direct', {
    web: 'complete',
    native: 'partial',
    gaps: ['native: the canvas carries the describeChart sentence; `accessibleTable` (the per-datum table) is named and dropped'],
    evidence: ['src/engine/canvas-host.test.tsx', 'src/engine/a11y-extras-cells.test.ts', 'src/engine/option-path-evidence.browser.test.tsx', NATIVE + 'chart-native-a11y.test.ts', NATIVE + 'chart-a11y-full-data-native.test.ts'],
  }),
] as const)()

export interface ChartCapabilityScore {
  complete: number
  partial: number
  pending: number
  total: number
  percent: number
}

/**
 * The share of `mode` rows that are complete — on one `target`, or on EVERY
 * target when none is given (a row counts only once it is complete on all
 * three).
 */
export function chartCapabilityScore(mode: ChartCapabilityMode, target?: ChartCapabilityTarget): ChartCapabilityScore {
  const rows = CHART_CAPABILITIES.filter((item) => item.mode === mode)
  const statusOf = (item: ChartCapability): ChartCapabilityStatus => (target === undefined ? item.status : item.targets[target])
  const count = (s: ChartCapabilityStatus): number => rows.filter((item) => statusOf(item) === s).length
  const complete = count('complete')
  return {
    complete,
    partial: count('partial'),
    pending: count('pending'),
    total: rows.length,
    percent: rows.length === 0 ? 0 : Math.floor((complete * 100) / rows.length),
  }
}
