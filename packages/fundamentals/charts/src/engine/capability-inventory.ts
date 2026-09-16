/**
 * Versioned capability ledger for the public option and runtime contracts.
 *
 * `direct` means the first-party draw-list engine has equivalent web,
 * SwiftUI and Compose paths. `hosted` means the unchanged browser renderer is
 * available through the supported native host. The two scores are deliberately
 * separate: hosted coverage never inflates the direct-native score.
 */
export const CHART_CAPABILITY_CONTRACT = 'option-contract-2026-09-16.21' as const

export type ChartCapabilityArea = 'data' | 'series' | 'coordinates' | 'runtime' | 'presentation'
export type ChartCapabilityMode = 'direct' | 'hosted'
export type ChartCapabilityStatus = 'complete' | 'partial' | 'pending'

export interface ChartCapability {
  id: string
  area: ChartCapabilityArea
  mode: ChartCapabilityMode
  status: ChartCapabilityStatus
  /** Package-relative proof; native compiler evidence may traverse to its sibling package. */
  evidence: readonly string[]
}

const row = (
  id: string,
  area: ChartCapabilityArea,
  mode: ChartCapabilityMode,
  status: ChartCapabilityStatus,
  ...evidence: string[]
): ChartCapability => ({ id, area, mode, status, evidence })

export const CHART_CAPABILITIES: readonly ChartCapability[] = [
  row('data.option-merge', 'data', 'direct', 'complete', 'src/engine/option-composite.test.ts'),
  // A literal dataset resolves at COMPILE time in the native desugar through
  // the same `resolveDataset` the web runs (`@pyreon/charts/option-layer`).
  row('data.dataset', 'data', 'direct', 'complete', 'src/engine/option-layer.ts', '../../native/compiler/src/tests/chart-dataset-native.test.ts'),
  row('data.dimensions-encode', 'data', 'direct', 'complete', 'src/engine/option-encode-tooltip.test.ts', '../../native/compiler/src/tests/chart-dataset-native.test.ts'),
  row('data.transforms', 'data', 'direct', 'partial', 'src/engine/option-transform.test.ts', '../../native/compiler/src/tests/chart-dataset-native.test.ts'), // built-in filter/sort cross; registered transforms run on the web only
  // sampling / large / progressive resolve to bounded decimation on shared rows;
  // the native OptionChart runs the SAME decimation at compile time against the
  // option's static width (its `width` prop, or the web's own 640 default).
  row('data.progressive-large', 'data', 'direct', 'complete', 'src/engine/option-sampling.test.ts', '../../native/compiler/src/tests/chart-sampling-native.test.ts'),
  row('data.empty-null', 'data', 'direct', 'complete', 'src/engine/gaps.test.ts'),

  ...[
    'bar', 'pie', 'scatter', 'effect-scatter', 'radar', 'tree',
    'treemap', 'sunburst', 'boxplot', 'candlestick', 'heatmap', 'graph',
    'funnel', 'gauge', 'river', 'custom',
  ].map((name) => row(`series.${name}`, 'series', 'direct', 'complete', 'src/engine/option.test.ts')),
  // Rows whose engine still emits a live "not supported" warning for a
  // contract member are PARTIAL, whatever else they render. The path cited
  // is the warning site; the row closes when the warning goes.
  row('series.line', 'series', 'direct', 'complete', 'src/engine/option-edges.test.ts'),
  row('series.sankey', 'series', 'direct', 'complete', 'src/engine/option-orient.test.ts', '../../native/compiler/src/tests/chart-orient-native.test.ts'),
  row('series.map', 'series', 'direct', 'partial', 'src/engine/geo-web.ts'),
  row('series.lines', 'series', 'direct', 'partial', 'src/engine/lines-series.test.ts'),
  row('series.pictorial-bar', 'series', 'direct', 'partial', 'src/engine/option.ts'),
  row('series.extensions', 'series', 'hosted', 'complete', 'src/webview.ts'),

  ...['grid', 'title', 'legend', 'tooltip', 'aria']
    .map((name) => row(`coordinates.${name}`, 'coordinates', 'direct', 'complete', 'src/engine/option.test.ts')),
  row('coordinates.polar', 'coordinates', 'direct', 'complete', 'src/engine/polar.test.ts', '../../native/compiler/src/tests/chart-polar-scatter-native.test.ts'),
  row('coordinates.calendar', 'coordinates', 'direct', 'complete', 'src/engine/option-orient.test.ts', '../../native/compiler/src/tests/chart-orient-native.test.ts'),
  row('coordinates.parallel', 'coordinates', 'direct', 'complete', 'src/engine/option-orient.test.ts', '../../native/compiler/src/tests/chart-orient-native.test.ts'),
  row('coordinates.single-axis', 'coordinates', 'direct', 'complete', 'src/engine/single-axis.test.ts'), // scatter / effectScatter + theme river: ECharts' own contract
  row('coordinates.axes', 'coordinates', 'direct', 'partial', 'src/engine/option.ts'), // one x axis, two y axes
  row('coordinates.visual-map', 'coordinates', 'direct', 'partial', 'src/engine/visual-map.ts'), // calculable handle
  row('coordinates.graphic', 'coordinates', 'direct', 'partial', 'src/engine/option-layer.ts'), // element types
  row('coordinates.mark-point', 'coordinates', 'direct', 'complete', 'src/engine/option-marks.test.ts', '../../native/compiler/src/tests/chart-marks-native.test.ts'),
  row('coordinates.mark-line', 'coordinates', 'direct', 'complete', 'src/engine/option-marks.test.ts', '../../native/compiler/src/tests/chart-marks-native.test.ts'),
  row('coordinates.geo', 'coordinates', 'direct', 'partial', 'src/engine/geo-web.ts'),
  row('coordinates.data-zoom', 'coordinates', 'direct', 'partial', 'src/engine/navigator.ts'),
  row('coordinates.timeline', 'coordinates', 'direct', 'partial', 'src/engine/option-composite.ts', '../../native/compiler/src/tests/chart-option-family-native.test.ts'),
  row('coordinates.toolbox', 'coordinates', 'direct', 'partial', 'src/engine/toolbox.ts'),
  row('coordinates.brush', 'coordinates', 'direct', 'partial', 'src/engine/brush.ts'),
  row('coordinates.mark-area', 'coordinates', 'direct', 'complete', 'src/engine/option.test.ts', '../../native/compiler/src/tests/chart-option-family-native.test.ts'),

  row('runtime.init-dispose-resize', 'runtime', 'hosted', 'complete', 'src/webview.ts'),
  row('runtime.option-updates', 'runtime', 'hosted', 'complete', 'src/webview.ts'),
  row('runtime.actions', 'runtime', 'hosted', 'complete', 'src/webview.browser.test.tsx'),
  row('runtime.events', 'runtime', 'hosted', 'complete', 'src/webview.browser.test.tsx'),
  row('runtime.connected-groups', 'runtime', 'hosted', 'complete', 'src/webview-group.browser.test.tsx', '../../native/compiler/src/tests/chart-webview-native.test.ts'),
  row('runtime.loading', 'runtime', 'hosted', 'complete', 'src/webview.browser.test.tsx'),
  row('runtime.themes', 'runtime', 'hosted', 'complete', 'src/tests/webview.test.ts'),
  row('runtime.maps', 'runtime', 'hosted', 'complete', 'src/tests/webview.test.ts'),
  row('runtime.renderer-options', 'runtime', 'hosted', 'complete', 'src/webview.ts'),
  row('runtime.extension-registration', 'runtime', 'hosted', 'complete', 'src/tests/webview.test.ts'),
  row('runtime.option-updates', 'runtime', 'direct', 'complete', 'src/engine/OptionChart.tsx'),
  // Still missing: brush, timelineChange / timelinePlayChange, selectDataRange, the roam actions.
  row('runtime.actions', 'runtime', 'direct', 'partial', 'src/engine/link.ts'),
  row('runtime.events', 'runtime', 'direct', 'complete', 'src/engine/events-actions.browser.test.tsx'),
  row('runtime.connected-groups', 'runtime', 'direct', 'complete', 'src/engine/link.ts'),
  row('runtime.resize', 'runtime', 'direct', 'complete', 'src/engine/canvas-host.tsx'),

  row('presentation.labels-rich-text', 'presentation', 'direct', 'partial', 'src/engine/option.ts'),
  row('presentation.states', 'presentation', 'direct', 'partial', 'src/engine/emphasis.test.ts'),
  row('presentation.symbols', 'presentation', 'direct', 'complete', 'src/engine/option-symbols.test.ts', '../../native/compiler/src/tests/chart-symbols-native.test.ts'),
  row('presentation.gradients-patterns', 'presentation', 'direct', 'partial', 'src/engine/option-gradients.test.ts', '../../native/compiler/src/tests/chart-gradients-native.test.ts'), // linear + radial gradients and decals cross; IMAGE patterns (`color: { image }`) warn by name
  row('presentation.decals', 'presentation', 'direct', 'partial', 'src/engine/pattern.test.ts'),
  row('presentation.animation', 'presentation', 'direct', 'complete', 'src/engine/cmd-tween.ts', '../../native/compiler/src/tests/native-chart-transition-parity.test.ts'),
  // Compile-time parity only: the completion plan requires native canvas
  // state/timing plus device evidence before this row closes.
  row('presentation.universal-transition', 'presentation', 'direct', 'partial', 'src/engine/cmd-tween.test.ts', '../../native/compiler/src/tests/native-chart-transition-parity.test.ts'),
  row('presentation.locale', 'presentation', 'direct', 'complete', 'src/engine/locale.ts'),
  row('presentation.rtl', 'presentation', 'direct', 'complete', 'src/engine/rtl.ts'),
  row('presentation.export-snapshot', 'presentation', 'direct', 'complete', 'src/engine/svg.ts'),
] as const

export interface ChartCapabilityScore {
  complete: number
  total: number
  percent: number
}

export function chartCapabilityScore(mode: ChartCapabilityMode): ChartCapabilityScore {
  const rows = CHART_CAPABILITIES.filter((item) => item.mode === mode)
  const complete = rows.filter((item) => item.status === 'complete').length
  return { complete, total: rows.length, percent: rows.length === 0 ? 0 : Math.floor((complete * 100) / rows.length) }
}
