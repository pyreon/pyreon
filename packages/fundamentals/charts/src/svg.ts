/**
 * @pyreon/charts/svg — charts as SVG strings, with no DOM. For server
 * rendering, static export and email.
 */
import { setFrameSerializer } from './engine/frame-seam'
import { measureApprox, renderSvg } from './engine/svg'

// Importing this entry on a server also enables `<Chart>`'s first-frame SVG
// in SSR / SSG HTML (see `engine/frame-seam.ts`). A side effect on purpose —
// `package.json` lists this file under `sideEffects`.
setFrameSerializer({ measure: measureApprox, svg: renderSvg })

export { chartToSvg } from './engine/svg-chart'
export type { ChartToSvgOptions } from './engine/svg-chart'
export {
  calendarToSvg,
  candlestickToSvg,
  chordToSvg,
  funnelToSvg,
  gaugeToSvg,
  ganttToSvg,
  graphToSvg,
  heatmapToSvg,
  parallelToSvg,
  pieToSvg,
  polarToSvg,
  radarToSvg,
  riverToSvg,
  sankeyToSvg,
  sunburstToSvg,
  treeToSvg,
  treemapToSvg,
} from './engine/family-svg'
export type {
  CalendarToSvgOptions,
  CandlestickToSvgOptions,
  ChordToSvgOptions,
  FunnelToSvgOptions,
  GaugeToSvgOptions,
  GanttToSvgOptions,
  GraphToSvgOptions,
  HeatmapToSvgOptions,
  ParallelToSvgOptions,
  PieToSvgOptions,
  PolarToSvgOptions,
  RadarToSvgOptions,
  RiverToSvgOptions,
  SankeyToSvgOptions,
  SunburstToSvgOptions,
  TreeToSvgOptions,
  TreemapToSvgOptions,
} from './engine/family-svg'
export { boxplotToSvg } from './engine/boxplot-svg'
export type { BoxplotToSvgOptions } from './engine/boxplot-svg'
export { geoToSvg } from './engine/geo-web'
export type { GeoToSvgOptions } from './engine/geo-web'
export { singleAxisToSvg } from './engine/single-axis-web'
export type { SingleAxisToSvgOptions } from './engine/single-axis-web'
export { geoPointsToSvg } from './engine/geo-points'
export type { GeoPointsToSvgOptions } from './engine/geo-points'
