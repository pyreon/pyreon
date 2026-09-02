import { describe, expect, it } from 'vitest'
import * as plot from '../plot'

// Every family, coordinate and facade entry point is reachable from the public
// subpath — a module that exists but is not exported is not shipped.
const EXPECTED = [
  'PlotChart', 'PieChart', 'GaugeChart', 'RadarChart', 'CandlestickChart', 'HeatmapChart',
  // BoxplotChart / boxplotToSvg join once #3211 (a sibling branch) lands.
  'FunnelChart', 'TreemapChart', 'SunburstChart', 'TreeChart', 'SankeyChart', 'GraphChart',
  'CalendarChart', 'ParallelChart', 'PolarChart', 'RiverChart', 'MapChart',
  'funnelToSvg', 'treemapToSvg', 'sunburstToSvg', 'treeToSvg', 'sankeyToSvg', 'graphToSvg',
  'calendarToSvg', 'parallelToSvg', 'polarToSvg', 'singleAxisToSvg', 'riverToSvg', 'geoToSvg', 'geoPointsToSvg',
  'compileOption', 'optionToSvg', 'planOption', 'compileFamily', 'familyToSvg',
  'resolveDataset', 'applyTransforms', 'graphicCommands', 'visualMapCommands', 'customCommands',
  'registerTheme', 'resolveTheme', 'registerLocale', 'numberFormatter', 'registerMap',
  'zoomWindow', 'brushRange', 'renderTitle',
  'OptionChart', 'GanttChart', 'createChartLink', 'sonifyValues', 'compiledCommands', 'valueToHz', 'resolveTimeline', 'splitGrids',
] as const

describe('@pyreon/charts/plot public surface', () => {
  it('exports every family, coordinate, facade layer and registry', () => {
    const missing = EXPECTED.filter((name) => typeof (plot as Record<string, unknown>)[name] !== 'function')
    expect(missing).toEqual([])
  })
  it('the option facade round-trips a gallery option to svg from the public entry', () => {
    const svg = plot.optionToSvg({ xAxis: { data: ['a', 'b'] }, yAxis: {}, series: [{ type: 'bar', data: [1, 2] }] }, { width: 200, height: 100, theme: 'dark' })
    expect(svg).toContain('<svg')
    expect(svg).toContain('#100c2a')
  })
})
