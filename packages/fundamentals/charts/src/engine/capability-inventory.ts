/**
 * Versioned capability ledger for the public option and runtime contracts.
 *
 * `direct` means the first-party draw-list engine has equivalent web,
 * SwiftUI and Compose paths. `hosted` means the unchanged browser renderer is
 * available through the supported native host. The two scores are deliberately
 * separate: hosted coverage never inflates the direct-native score.
 */
export const CHART_CAPABILITY_CONTRACT = 'option-contract-2026-09-16.11' as const

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
  row('data.dataset', 'data', 'direct', 'complete', 'src/engine/option-layer.ts'),
  row('data.dimensions-encode', 'data', 'direct', 'partial', 'src/engine/option-layer.ts'), // encode.tooltip
  row('data.transforms', 'data', 'direct', 'complete', 'src/engine/option-transform.test.ts'),
  // sampling / large / progressive resolve to bounded decimation on shared rows.
  row('data.progressive-large', 'data', 'direct', 'complete', 'src/engine/option-sampling.test.ts'),
  row('data.empty-null', 'data', 'direct', 'complete', 'src/engine/gaps.test.ts'),

  ...[
    'bar', 'pie', 'scatter', 'effect-scatter', 'radar', 'tree',
    'treemap', 'sunburst', 'boxplot', 'candlestick', 'heatmap', 'graph',
    'funnel', 'gauge', 'river', 'custom',
  ].map((name) => row(`series.${name}`, 'series', 'direct', 'complete', 'src/engine/option.test.ts')),
  // Rows whose engine still emits a live "not supported" warning for a
  // contract member are PARTIAL, whatever else they render. The path cited
  // is the warning site; the row closes when the warning goes.
  row('series.line', 'series', 'direct', 'partial', 'src/engine/option.ts'), // stacked lines
  row('series.sankey', 'series', 'direct', 'partial', 'src/engine/option-family.ts'), // vertical orient
  row('series.map', 'series', 'direct', 'partial', 'src/engine/geo-web.ts'),
  row('series.lines', 'series', 'direct', 'partial', 'src/engine/lines-series.test.ts'),
  row('series.pictorial-bar', 'series', 'direct', 'partial', 'src/engine/option.ts'),
  row('series.extensions', 'series', 'hosted', 'complete', 'src/webview.ts'),

  ...['grid', 'title', 'legend', 'tooltip', 'aria']
    .map((name) => row(`coordinates.${name}`, 'coordinates', 'direct', 'complete', 'src/engine/option.test.ts')),
  row('coordinates.polar', 'coordinates', 'direct', 'partial', 'src/engine/option-family.ts'), // bar + line only
  row('coordinates.calendar', 'coordinates', 'direct', 'partial', 'src/engine/option-family.ts'), // vertical orient
  row('coordinates.parallel', 'coordinates', 'direct', 'partial', 'src/engine/option-family.ts'), // vertical layout
  row('coordinates.single-axis', 'coordinates', 'direct', 'partial', 'src/engine/option-family.ts'), // scatter only
  row('coordinates.axes', 'coordinates', 'direct', 'partial', 'src/engine/option.ts'), // one x axis, two y axes
  row('coordinates.visual-map', 'coordinates', 'direct', 'partial', 'src/engine/visual-map.ts'), // calculable handle
  row('coordinates.graphic', 'coordinates', 'direct', 'partial', 'src/engine/option-layer.ts'), // element types
  row('coordinates.mark-point', 'coordinates', 'direct', 'partial', 'src/engine/option.ts'), // max/min/coord only
  row('coordinates.mark-line', 'coordinates', 'direct', 'partial', 'src/engine/option.ts'), // avg/max/min/axis only
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
  row('presentation.symbols', 'presentation', 'direct', 'partial', 'src/engine/marks.ts'),
  row('presentation.gradients-patterns', 'presentation', 'direct', 'partial', 'src/engine/gradient.ts'),
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
