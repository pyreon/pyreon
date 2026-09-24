import { describe, expect, it } from 'vitest'
import * as plot from '../engine'

// Every family, coordinate and facade entry point is reachable from the public
// subpath — a module that exists but is not exported is not shipped.
const EXPECTED = [
  'PlotChart', 'PieChart', 'GaugeChart', 'RadarChart', 'CandlestickChart', 'HeatmapChart', 'BoxplotChart', 'boxplotToSvg',
  // The shared host is public — the extension point for a family of your own — with its animation primitives.
  'canvasHost', 'shiftCmds', 'tweenCmds', 'sameCmdShape', 'cmdsEqual', 'easeOutCubic', 'renderChartIn', 'plotHitIndexIn', 'plotHitBarsIn', 'hitRadarIndex',
  'FunnelChart', 'TreemapChart', 'SunburstChart', 'TreeChart', 'SankeyChart', 'GraphChart',
  'CalendarChart', 'ParallelChart', 'PolarChart', 'SingleAxisChart', 'RiverChart', 'MapChart',
  'funnelToSvg', 'treemapToSvg', 'sunburstToSvg', 'treeToSvg', 'sankeyToSvg', 'graphToSvg',
  'calendarToSvg', 'parallelToSvg', 'polarToSvg', 'singleAxisToSvg', 'riverToSvg', 'geoToSvg', 'geoPointsToSvg',
  'registerLocale', 'numberFormatter', 'registerMap',
  'zoomWindow', 'brushRange', 'renderTitle',
  'GanttChart', 'createChartLink', 'sonifyValues', 'valueToHz', 'visualMap', 'gaugeDial',
] as const

describe('@pyreon/charts public surface', () => {
  it('exports every family, coordinate, facade layer and registry', () => {
    const missing = EXPECTED.filter((name) => typeof (plot as Record<string, unknown>)[name] !== 'function')
    expect(missing).toEqual([])
  })
})
