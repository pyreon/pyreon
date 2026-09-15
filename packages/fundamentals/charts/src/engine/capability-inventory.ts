/**
 * Versioned capability ledger for the public option and runtime contracts.
 *
 * `direct` means the first-party draw-list engine has equivalent web,
 * SwiftUI and Compose paths. `hosted` means the unchanged browser renderer is
 * available through the supported native host. The two scores are deliberately
 * separate: hosted coverage never inflates the direct-native score.
 */
export const CHART_CAPABILITY_CONTRACT = 'option-contract-2026-09-15.1' as const

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
  row('data.option-merge', 'data', 'direct', 'partial', 'src/engine/option-composite.ts'),
  row('data.dataset', 'data', 'direct', 'complete', 'src/engine/option-layer.ts'),
  row('data.dimensions-encode', 'data', 'direct', 'partial', 'src/engine/option-layer.ts'),
  row('data.transforms', 'data', 'direct', 'partial', 'src/engine/option-layer.ts'),
  row('data.progressive-large', 'data', 'direct', 'partial', 'src/engine/decimate.ts'),
  row('data.empty-null', 'data', 'direct', 'complete', 'src/engine/gaps.test.ts'),

  ...[
    'line', 'bar', 'pie', 'scatter', 'effect-scatter', 'radar', 'tree',
    'treemap', 'sunburst', 'boxplot', 'candlestick', 'heatmap', 'graph',
    'sankey', 'funnel', 'gauge', 'river', 'custom',
  ].map((name) => row(`series.${name}`, 'series', 'direct', 'complete', 'src/engine/option.test.ts')),
  row('series.map', 'series', 'direct', 'partial', 'src/engine/geo-web.ts'),
  row('series.lines', 'series', 'direct', 'partial', 'src/engine/lines-series.test.ts'),
  row('series.pictorial-bar', 'series', 'direct', 'partial', 'src/engine/option.ts'),
  row('series.extensions', 'series', 'hosted', 'complete', 'src/webview.ts'),

  ...['grid', 'polar', 'calendar', 'parallel', 'single-axis', 'axes', 'visual-map', 'title', 'legend', 'tooltip', 'graphic', 'aria', 'mark-point', 'mark-line']
    .map((name) => row(`coordinates.${name}`, 'coordinates', 'direct', 'complete', 'src/engine/option.test.ts')),
  row('coordinates.geo', 'coordinates', 'direct', 'partial', 'src/engine/geo-web.ts'),
  row('coordinates.data-zoom', 'coordinates', 'direct', 'partial', 'src/engine/navigator.ts'),
  row('coordinates.timeline', 'coordinates', 'direct', 'partial', 'src/engine/option-composite.ts'),
  row('coordinates.toolbox', 'coordinates', 'direct', 'partial', 'src/engine/toolbox.ts'),
  row('coordinates.brush', 'coordinates', 'direct', 'partial', 'src/engine/brush.ts'),
  row('coordinates.mark-area', 'coordinates', 'direct', 'complete', 'src/engine/option.test.ts', '../../native/compiler/src/tests/chart-option-family-native.test.ts'),

  row('runtime.init-dispose-resize', 'runtime', 'hosted', 'complete', 'src/webview.ts'),
  row('runtime.option-updates', 'runtime', 'hosted', 'complete', 'src/webview.ts'),
  row('runtime.actions', 'runtime', 'hosted', 'pending', 'src/webview.ts'),
  row('runtime.events', 'runtime', 'hosted', 'partial', 'src/webview.ts'),
  row('runtime.connected-groups', 'runtime', 'hosted', 'pending', 'src/webview.ts'),
  row('runtime.loading', 'runtime', 'hosted', 'partial', 'src/webview.ts'),
  row('runtime.themes', 'runtime', 'hosted', 'partial', 'src/webview.ts'),
  row('runtime.maps', 'runtime', 'hosted', 'partial', 'src/webview.ts'),
  row('runtime.renderer-options', 'runtime', 'hosted', 'complete', 'src/webview.ts'),
  row('runtime.extension-registration', 'runtime', 'hosted', 'pending', 'src/webview.ts'),
  row('runtime.option-updates', 'runtime', 'direct', 'complete', 'src/engine/OptionChart.tsx'),
  row('runtime.actions', 'runtime', 'direct', 'partial', 'src/engine/link.ts'),
  row('runtime.events', 'runtime', 'direct', 'partial', 'src/engine/events-actions.browser.test.tsx'),
  row('runtime.connected-groups', 'runtime', 'direct', 'complete', 'src/engine/link.ts'),
  row('runtime.resize', 'runtime', 'direct', 'complete', 'src/engine/canvas-host.tsx'),

  row('presentation.labels-rich-text', 'presentation', 'direct', 'partial', 'src/engine/option.ts'),
  row('presentation.states', 'presentation', 'direct', 'partial', 'src/engine/emphasis.test.ts'),
  row('presentation.symbols', 'presentation', 'direct', 'partial', 'src/engine/marks.ts'),
  row('presentation.gradients-patterns', 'presentation', 'direct', 'partial', 'src/engine/gradient.ts'),
  row('presentation.decals', 'presentation', 'direct', 'pending', 'src/engine/render.ts'),
  row('presentation.animation', 'presentation', 'direct', 'partial', 'src/engine/cmd-tween.ts'),
  row('presentation.universal-transition', 'presentation', 'direct', 'pending', 'src/engine/cmd-tween.ts'),
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
