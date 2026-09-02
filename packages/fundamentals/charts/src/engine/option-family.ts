// The non-cartesian half of the option facade: pie / gauge / radar /
// candlestick / heatmap options → the family renderers. Same contract as
// `compileOption`: nothing is dropped silently — every unmapped key becomes
// a named warning — and the output is data the family SVG helpers (and,
// later, the family components) consume directly.

import type { EChartsOption, OptionWarning } from './option'
import { candlestickToSvg, funnelToSvg, gaugeToSvg, heatmapToSvg, pieToSvg, polarToSvg, radarToSvg, riverToSvg, sunburstToSvg, treeToSvg, treemapToSvg } from './family-svg'
import type { TreeNode, TreemapOptions } from './treemap'
import type { SunburstOptions } from './sunburst'
import type { TreeOptions, TreeOrient } from './tree'
import { sankeyToSvg } from './sankey'
import type { SankeyLink, SankeyNode, SankeyOptions } from './sankey'
import { graphToSvg } from './graph'
import type { GraphLink, GraphNode, GraphOptions } from './graph'
import { calendarToSvg } from './calendar'
import type { CalendarOptions } from './calendar'
import { parallelToSvg } from './parallel'
import type { ParallelAxis, ParallelOptions, ParallelRow } from './parallel'
import type { PolarAxes, PolarOptions, PolarSeries } from './polar'
import type { RiverOptions, RiverSeries } from './river'
import { resolveDataset } from './option-layer'
import { geoToSvg, getMap } from './geo'
import type { GeoJson, GeoOptions } from './geo'
import { geoPointsToSvg } from './geo-points'
import type { GeoPath, GeoPoint, GeoPointsOptions } from './geo-points'
import { singleAxisToSvg } from './single-axis'
import type { SingleAxisOptions, SingleAxisPoint, SingleAxisSpec } from './single-axis'
import type { FunnelOptions } from './funnel'
import type { RadarAxis } from './radar'
import type { Double } from './types'

export type FamilyPlan =
  | { kind: 'pie'; rows: { value: Double; name: string; color: string | undefined }[]; innerRadius: Double; showLabels: boolean; showLegend: boolean; title: string | undefined }
  | { kind: 'gauge'; value: Double; min: Double; max: Double; showValue: boolean; thickness: Double | undefined; valueColor: string | undefined; title: string | undefined }
  | { kind: 'radar'; axes: RadarAxis[]; rows: { values: Double[]; name: string; color: string | undefined }[]; fillAlpha: Double; showLegend: boolean; title: string | undefined }
  | { kind: 'candlestick'; rows: { x: string; open: Double; high: Double; low: Double; close: Double }[]; upColor: string | undefined; downColor: string | undefined; title: string | undefined }
  | { kind: 'heatmap'; rows: { x: string; y: string; value: Double }[]; colors: string[] | undefined; title: string | undefined }
  | { kind: 'funnel'; rows: { value: Double; name: string; color: string | undefined }[]; funnel: FunnelOptions; title: string | undefined }
  | { kind: 'treemap'; nodes: TreeNode[]; treemap: TreemapOptions; title: string | undefined }
  | { kind: 'sunburst'; nodes: TreeNode[]; innerRatio: Double; sunburst: SunburstOptions; title: string | undefined }
  | { kind: 'tree'; nodes: TreeNode[]; tree: TreeOptions; title: string | undefined }
  | { kind: 'sankey'; nodes: SankeyNode[]; links: SankeyLink[]; sankey: SankeyOptions; title: string | undefined }
  | { kind: 'graph'; nodes: GraphNode[]; links: GraphLink[]; graph: GraphOptions; title: string | undefined }
  | { kind: 'calendar'; start: string; end: string; values: Record<string, Double>; calendar: CalendarOptions; title: string | undefined }
  | { kind: 'parallel'; axes: ParallelAxis[]; rows: ParallelRow[]; parallel: ParallelOptions; title: string | undefined }
  | { kind: 'polar'; axes: PolarAxes; series: PolarSeries[]; polar: PolarOptions; title: string | undefined }
  | { kind: 'themeRiver'; series: RiverSeries[]; river: RiverOptions; title: string | undefined }
  | { kind: 'map'; geo: GeoJson; values: Record<string, Double>; options: GeoOptions; title: string | undefined }
  | { kind: 'geoPoints'; geo: GeoJson; points: GeoPoint[]; paths: GeoPath[]; map: GeoOptions; options: GeoPointsOptions; title: string | undefined }
  | { kind: 'singleAxis'; axis: SingleAxisSpec; points: SingleAxisPoint[]; options: SingleAxisOptions; title: string | undefined }

export interface CompiledFamily {
  plan: FamilyPlan
  warnings: OptionWarning[]
  supported: boolean
}

const FAMILY_TYPES = new Set(['pie', 'gauge', 'radar', 'candlestick', 'heatmap', 'funnel', 'treemap', 'sunburst', 'tree', 'sankey', 'graph', 'parallel', 'themeRiver', 'map'])
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}
const first = <T,>(v: T | T[] | undefined): T | undefined => (Array.isArray(v) ? v[0] : v)
const pct = (v: unknown): number | null => {
  if (typeof v === 'string' && v.endsWith('%')) return num(v.slice(0, -1))
  return num(v)
}

/** True when the option's first series is a family (non-cartesian) type. */
export function isFamilyOption(option: EChartsOption): boolean {
  const s = first(option['series'] as unknown)
  return isObj(s) && typeof s['type'] === 'string' && (FAMILY_TYPES.has(s['type'] as string) || s['coordinateSystem'] === 'polar' || s['coordinateSystem'] === 'geo' || s['coordinateSystem'] === 'singleAxis')
}

const KNOWN_TOP = new Set(['series', 'title', 'legend', 'tooltip', 'color', 'radar', 'xAxis', 'yAxis', 'visualMap', 'animation', 'backgroundColor', 'textStyle', 'grid', 'calendar', 'parallel', 'parallelAxis', 'polar', 'angleAxis', 'radiusAxis', 'singleAxis', 'dataset', 'graphic', 'geo'])
const KNOWN_BY_FAMILY: Record<string, Set<string>> = {
  pie: new Set(['type', 'name', 'data', 'radius', 'label', 'itemStyle', 'center', 'emphasis', 'color']),
  gauge: new Set(['type', 'name', 'data', 'min', 'max', 'detail', 'axisLine', 'progress', 'itemStyle', 'color']),
  radar: new Set(['type', 'name', 'data', 'areaStyle', 'itemStyle', 'lineStyle', 'symbol', 'color']),
  candlestick: new Set(['type', 'name', 'data', 'itemStyle', 'color']),
  heatmap: new Set(['coordinateSystem', 'calendarIndex', 'type', 'name', 'data', 'label', 'itemStyle', 'emphasis', 'color']),
  funnel: new Set(['type', 'name', 'data', 'sort', 'gap', 'minSize', 'label', 'itemStyle', 'funnelAlign', 'color', 'emphasis']),
  treemap: new Set(['type', 'name', 'data', 'leafDepth', 'label', 'itemStyle', 'color', 'emphasis', 'roam', 'nodeClick', 'breadcrumb']),
  sunburst: new Set(['type', 'name', 'data', 'radius', 'center', 'sort', 'startAngle', 'label', 'itemStyle', 'color', 'emphasis', 'nodeClick', 'levels']),
  tree: new Set(['type', 'name', 'data', 'orient', 'layout', 'symbol', 'symbolSize', 'initialTreeDepth', 'edgeShape', 'label', 'itemStyle', 'lineStyle', 'leaves', 'roam', 'expandAndCollapse', 'emphasis', 'top', 'left', 'right', 'bottom']),
  sankey: new Set(['type', 'name', 'data', 'nodes', 'links', 'edges', 'nodeWidth', 'nodeGap', 'nodeAlign', 'layoutIterations', 'orient', 'draggable', 'label', 'itemStyle', 'lineStyle', 'emphasis', 'levels', 'top', 'left', 'right', 'bottom']),
  singleAxis: new Set(['type', 'name', 'data', 'coordinateSystem', 'singleAxisIndex', 'symbolSize', 'symbol', 'label', 'itemStyle', 'emphasis', 'color', 'animation']),
  geo: new Set(['type', 'name', 'data', 'coordinateSystem', 'geoIndex', 'symbolSize', 'symbol', 'label', 'itemStyle', 'lineStyle', 'effect', 'polyline', 'emphasis', 'rippleEffect', 'showEffectOn', 'color', 'animation', 'zlevel', 'z']),
  map: new Set(['type', 'name', 'data', 'map', 'roam', 'label', 'itemStyle', 'emphasis', 'select', 'selectedMode', 'nameProperty', 'projection', 'zoom', 'center', 'aspectScale', 'layoutCenter', 'layoutSize', 'showLegendSymbol', 'geoIndex', 'left', 'top', 'right', 'bottom']),
  themeRiver: new Set(['type', 'name', 'data', 'coordinateSystem', 'singleAxisIndex', 'boundaryGap', 'label', 'itemStyle', 'emphasis', 'color', 'animation']),
  polar: new Set(['type', 'name', 'data', 'coordinateSystem', 'polarIndex', 'stack', 'itemStyle', 'lineStyle', 'label', 'emphasis', 'smooth', 'symbol', 'symbolSize', 'barWidth', 'barGap', 'barCategoryGap', 'roundCap', 'showBackground', 'backgroundStyle', 'areaStyle', 'animation', 'color']),
  parallel: new Set(['type', 'name', 'data', 'coordinateSystem', 'parallelIndex', 'lineStyle', 'emphasis', 'inactiveOpacity', 'activeOpacity', 'realtime', 'smooth', 'progressive', 'animation']),
  graph: new Set(['type', 'name', 'data', 'nodes', 'links', 'edges', 'categories', 'layout', 'symbol', 'symbolSize', 'force', 'circular', 'roam', 'label', 'itemStyle', 'lineStyle', 'emphasis', 'draggable', 'edgeSymbol', 'edgeSymbolSize', 'focusNodeAdjacency', 'zoom', 'center', 'left', 'top', 'right', 'bottom', 'width', 'height', 'coordinateSystem']),
}

/**
 * Compile a family option. Returns null when the first series is cartesian
 * (`compileOption` owns those) so `planOption` can route without guessing.
 */
export function compileFamily(rawOption: EChartsOption): CompiledFamily | null {
  if (!isFamilyOption(rawOption)) return null
  const warnings: OptionWarning[] = []
  const warn = (code: OptionWarning['code'], path: string, message: string): void => {
    warnings.push({ code, path, message })
  }
  const resolved = resolveDataset(rawOption)
  for (const w of resolved.warnings) warnings.push(w)
  const option = resolved.option as EChartsOption
  let supported = true
  const seriesArr = Array.isArray(option['series']) ? (option['series'] as unknown[]) : [option['series']]
  const s = seriesArr[0] as Record<string, unknown>
  const type = s['type'] as string
  const familyKey = s['coordinateSystem'] === 'polar' ? 'polar' : s['coordinateSystem'] === 'geo' ? 'geo' : s['coordinateSystem'] === 'singleAxis' ? 'singleAxis' : type
  for (const key of Object.keys(option)) if (!KNOWN_TOP.has(key)) warn('option-key-unsupported', key, `"${key}" has no mapping yet; it was ignored.`)
  for (const key of Object.keys(s)) if (!KNOWN_BY_FAMILY[familyKey]!.has(key)) warn('series-option-unsupported', `series[0].${key}`, `"${key}" has no mapping for ${type} yet; it was ignored.`)
  if (seriesArr.length > 1 && type !== 'radar' && familyKey !== 'polar' && familyKey !== 'geo' && familyKey !== 'singleAxis') {
    warn('series-option-unsupported', 'series[1]', `Only one ${type} series is rendered per chart; extra series were ignored.`)
  }
  const titleRaw = first(option['title'] as Record<string, unknown> | Record<string, unknown>[] | undefined)
  const title = isObj(titleRaw) && typeof titleRaw['text'] === 'string' ? (titleRaw['text'] as string) : undefined
  const legendRaw = option['legend']
  const showLegend = legendRaw !== undefined && !(isObj(legendRaw) && legendRaw['show'] === false)
  const palette: string[] = Array.isArray(option['color']) ? (option['color'] as unknown[]).filter((c): c is string => typeof c === 'string') : []
  const data = Array.isArray(s['data']) ? (s['data'] as unknown[]) : []
  if (!Array.isArray(s['data'])) {
    warn('series-data-shape', 'series[0].data', 'Series data must be an array; treated as empty.')
  }

  if (type === 'pie') {
    const rows: { value: Double; name: string; color: string | undefined }[] = []
    for (let i = 0; i < data.length; i++) {
      const d = data[i]
      const v = isObj(d) ? num(d['value']) : num(d)
      if (v === null) {
        warn('series-data-shape', `series[0].data[${i}]`, 'A pie datum needs a numeric value; it was skipped.')
        continue
      }
      const item = isObj(d) && isObj(d['itemStyle']) ? d['itemStyle'] : {}
      rows.push({
        value: v,
        name: isObj(d) && typeof d['name'] === 'string' ? (d['name'] as string) : `Slice ${i + 1}`,
        color: typeof item['color'] === 'string' ? (item['color'] as string) : palette[i % Math.max(1, palette.length)],
      })
    }
    // radius: '60%' | ['40%', '70%'] → the hole as a fraction of the outer radius.
    let innerRadius = 0.0
    const r = s['radius']
    if (Array.isArray(r) && r.length === 2) {
      const inner = pct(r[0])
      const outer = pct(r[1])
      if (inner !== null && outer !== null && outer > 0) innerRadius = Math.max(0.0, Math.min(0.95, inner / outer))
    }
    const label = isObj(s['label']) ? s['label'] : {}
    return { plan: { kind: 'pie', rows, innerRadius, showLabels: label['show'] !== false, showLegend, title }, warnings, supported }
  }

  if (type === 'gauge') {
    const d0 = data[0]
    const value = isObj(d0) ? num(d0['value']) : num(d0)
    if (value === null) {
      warn('series-data-shape', 'series[0].data[0]', 'A gauge needs one numeric value.')
      supported = false
    }
    const detail = isObj(s['detail']) ? s['detail'] : {}
    const axisLine = isObj(s['axisLine']) && isObj(s['axisLine']['lineStyle']) ? s['axisLine']['lineStyle'] : {}
    const progress = isObj(s['progress']) && isObj(s['progress']['itemStyle']) ? s['progress']['itemStyle'] : {}
    const item = isObj(s['itemStyle']) ? s['itemStyle'] : {}
    return {
      plan: {
        kind: 'gauge',
        value: value ?? 0.0,
        min: num(s['min']) ?? 0.0,
        max: num(s['max']) ?? 100.0,
        showValue: detail['show'] !== false,
        thickness: num(axisLine['width']) ?? undefined,
        valueColor: typeof progress['color'] === 'string' ? (progress['color'] as string) : typeof item['color'] === 'string' ? (item['color'] as string) : undefined,
        title,
      },
      warnings,
      supported,
    }
  }

  if (type === 'radar') {
    const radar = first(option['radar'] as Record<string, unknown> | Record<string, unknown>[] | undefined)
    const indicators = isObj(radar) && Array.isArray(radar['indicator']) ? (radar['indicator'] as unknown[]) : []
    const axes: RadarAxis[] = []
    for (let i = 0; i < indicators.length; i++) {
      const ind = indicators[i]
      if (!isObj(ind)) continue
      axes.push({ label: typeof ind['name'] === 'string' ? (ind['name'] as string) : `Axis ${i + 1}`, max: num(ind['max']) ?? 100.0 })
    }
    if (axes.length < 3) {
      warn('series-data-shape', 'radar.indicator', 'A radar needs at least three indicators.')
      supported = false
    }
    const rows: { values: Double[]; name: string; color: string | undefined }[] = []
    let fillAlpha = 0.25
    for (let si = 0; si < seriesArr.length; si++) {
      const rs = seriesArr[si]
      if (!isObj(rs) || rs['type'] !== 'radar') continue
      const area = isObj(rs['areaStyle']) ? rs['areaStyle'] : rs['areaStyle'] === undefined ? null : {}
      if (area !== null && num(area['opacity']) !== null) fillAlpha = num(area['opacity']) as number
      const rdata = Array.isArray(rs['data']) ? (rs['data'] as unknown[]) : []
      for (let i = 0; i < rdata.length; i++) {
        const d = rdata[i]
        const raw = isObj(d) && Array.isArray(d['value']) ? (d['value'] as unknown[]) : Array.isArray(d) ? d : null
        if (raw === null) {
          warn('series-data-shape', `series[${si}].data[${i}]`, 'A radar datum needs a value array; it was skipped.')
          continue
        }
        const item = isObj(d) && isObj(d['itemStyle']) ? d['itemStyle'] : {}
        rows.push({
          values: raw.map((v) => num(v) ?? 0.0),
          name: isObj(d) && typeof d['name'] === 'string' ? (d['name'] as string) : `Series ${rows.length + 1}`,
          color: typeof item['color'] === 'string' ? (item['color'] as string) : palette[rows.length % Math.max(1, palette.length)],
        })
      }
    }
    return { plan: { kind: 'radar', axes, rows, fillAlpha, showLegend, title }, warnings, supported }
  }

  if (type === 'candlestick') {
    const xAxis = first(option['xAxis'] as Record<string, unknown> | Record<string, unknown>[] | undefined)
    const cats = isObj(xAxis) && Array.isArray(xAxis['data']) ? (xAxis['data'] as unknown[]).map((c) => String(c)) : []
    const rows: { x: string; open: Double; high: Double; low: Double; close: Double }[] = []
    for (let i = 0; i < data.length; i++) {
      const d = data[i]
      const arr = Array.isArray(d) ? d : isObj(d) && Array.isArray(d['value']) ? (d['value'] as unknown[]) : null
      // ECharts candlestick tuples are [open, close, lowest, highest].
      if (arr === null || arr.length < 4) {
        warn('series-data-shape', `series[0].data[${i}]`, 'A candlestick datum is [open, close, low, high]; it was skipped.')
        continue
      }
      rows.push({ x: cats[i] ?? String(i + 1), open: num(arr[0]) ?? 0.0, close: num(arr[1]) ?? 0.0, low: num(arr[2]) ?? 0.0, high: num(arr[3]) ?? 0.0 })
    }
    const item = isObj(s['itemStyle']) ? s['itemStyle'] : {}
    return {
      plan: {
        kind: 'candlestick',
        rows,
        upColor: typeof item['color'] === 'string' ? (item['color'] as string) : undefined,
        downColor: typeof item['color0'] === 'string' ? (item['color0'] as string) : undefined,
        title,
      },
      warnings,
      supported,
    }
  }

  if (familyKey === 'singleAxis') {
    if (type !== 'scatter' && type !== 'effectScatter') warn('series-type-unsupported', 'series[0].type', 'Only scatter renders on a single axis; ' + type + ' was skipped.')
    const axRaw = first(option['singleAxis'] as Record<string, unknown> | Record<string, unknown>[] | undefined)
    const ax = isObj(axRaw) ? axRaw : {}
    const isCat = ax['type'] === 'category'
    const cats = Array.isArray(ax['data']) ? (ax['data'] as unknown[]).map((c) => (typeof c === 'string' ? c : isObj(c) && typeof c['value'] === 'string' ? (c['value'] as string) : String(c))) : undefined
    const lo = num(ax['min'])
    const hi = num(ax['max'])
    const axis: SingleAxisSpec = {
      type: isCat ? 'category' : 'value',
      ...(isCat ? { categories: cats ?? [] } : {}),
      ...(!isCat && lo !== null && hi !== null ? { domain: [lo, hi] as [Double, Double] } : {}),
      ...(typeof ax['name'] === 'string' ? { name: ax['name'] as string } : {}),
    }
    const points: SingleAxisPoint[] = []
    if (type === 'scatter' || type === 'effectScatter') {
      for (let i = 0; i < data.length; i++) {
        const d = data[i]
        const arr = Array.isArray(d) ? d : isObj(d) && Array.isArray(d['value']) ? (d['value'] as unknown[]) : isObj(d) ? [d['value']] : [d]
        const x = num(arr[0])
        if (x === null) {
          warn('series-data-shape', 'series[0].data[' + String(i) + ']', 'A single-axis datum must be a value or [position, size]; it was skipped.')
          continue
        }
        const size = num(arr[1])
        const item = isObj(d) && isObj(d['itemStyle']) ? d['itemStyle'] : {}
        points.push({
          x,
          ...(size !== null ? { size } : {}),
          ...(isObj(d) && typeof d['name'] === 'string' ? { name: d['name'] as string } : {}),
          ...(typeof item['color'] === 'string' ? { color: item['color'] as string } : {}),
        })
      }
    }
    const label = isObj(s['label']) ? s['label'] : {}
    const item = isObj(s['itemStyle']) ? s['itemStyle'] : {}
    const size = num(s['symbolSize'])
    const options: SingleAxisOptions = {
      showLabels: label['show'] === true,
      ...(size !== null ? { radius: size / 2.0 } : {}),
      ...(typeof item['color'] === 'string' ? { color: item['color'] as string } : {}),
    }
    return { plan: { kind: 'singleAxis', axis, points, options, title }, warnings, supported }
  }

  if (familyKey === 'geo') {
    if (type !== 'scatter' && type !== 'effectScatter' && type !== 'lines') {
      warn('series-type-unsupported', 'series[0].type', 'Only scatter, effectScatter and lines render on the geo coordinate; ' + type + ' was skipped.')
    }
    const geoCfg = first(option['geo'] as Record<string, unknown> | Record<string, unknown>[] | undefined)
    const geoObj = isObj(geoCfg) ? geoCfg : {}
    const mapName = typeof geoObj['map'] === 'string' ? (geoObj['map'] as string) : ''
    const found = getMap(mapName)
    if (found === null) warn('series-option-unsupported', 'geo.map', 'Map "' + mapName + '" is not registered (call registerMap first); nothing was drawn.')
    const geo: GeoJson = found ?? { type: 'FeatureCollection', features: [] }
    const geoItem = isObj(geoObj['itemStyle']) ? geoObj['itemStyle'] : {}
    const map: GeoOptions = {
      ...(typeof geoItem['borderColor'] === 'string' ? { borderColor: geoItem['borderColor'] as string } : {}),
      ...(typeof geoItem['areaColor'] === 'string' ? { emptyColor: geoItem['areaColor'] as string } : {}),
    }
    const points: GeoPoint[] = []
    if (type === 'scatter' || type === 'effectScatter') {
      for (let i = 0; i < data.length; i++) {
        const d = data[i]
        const arr = Array.isArray(d) ? d : isObj(d) && Array.isArray(d['value']) ? (d['value'] as unknown[]) : null
        const lon = arr === null ? null : num(arr[0])
        const lat = arr === null ? null : num(arr[1])
        if (arr === null || lon === null || lat === null) {
          warn('series-data-shape', 'series[0].data[' + String(i) + ']', 'A geo scatter datum must be [lon, lat, value?]; it was skipped.')
          continue
        }
        const v = num(arr[2])
        const item = isObj(d) && isObj(d['itemStyle']) ? d['itemStyle'] : {}
        points.push({
          lon,
          lat,
          ...(isObj(d) && typeof d['name'] === 'string' ? { name: d['name'] as string } : {}),
          ...(v !== null ? { value: v } : {}),
          ...(typeof item['color'] === 'string' ? { color: item['color'] as string } : {}),
        })
      }
    }
    const paths: GeoPath[] = []
    if (type === 'lines') {
      const ls = isObj(s['lineStyle']) ? s['lineStyle'] : {}
      for (let i = 0; i < data.length; i++) {
        const d = data[i]
        const coords = Array.isArray(d) ? d : isObj(d) && Array.isArray(d['coords']) ? (d['coords'] as unknown[]) : null
        const pairs: [Double, Double][] = []
        for (const c of coords ?? []) {
          const lon = Array.isArray(c) ? num(c[0]) : null
          const lat = Array.isArray(c) ? num(c[1]) : null
          if (lon !== null && lat !== null) pairs.push([lon, lat])
        }
        if (pairs.length < 2) {
          warn('series-data-shape', 'series[0].data[' + String(i) + ']', 'A geo lines datum needs coords with at least two [lon, lat] pairs; it was skipped.')
          continue
        }
        const dls = isObj(d) && isObj(d['lineStyle']) ? d['lineStyle'] : {}
        const color = typeof dls['color'] === 'string' ? (dls['color'] as string) : typeof ls['color'] === 'string' ? (ls['color'] as string) : undefined
        const width = num(dls['width']) ?? num(ls['width'])
        paths.push({ coords: pairs, ...(color !== undefined ? { color } : {}), ...(width !== null ? { width } : {}) })
      }
    }
    const label = isObj(s['label']) ? s['label'] : {}
    const item = isObj(s['itemStyle']) ? s['itemStyle'] : {}
    const size = num(s['symbolSize'])
    const options: GeoPointsOptions = {
      showLabels: label['show'] === true,
      effect: type === 'effectScatter',
      ...(size !== null ? { radius: size / 2.0 } : {}),
      ...(typeof item['color'] === 'string' ? { color: item['color'] as string } : {}),
    }
    return { plan: { kind: 'geoPoints', geo, points, paths, map, options, title }, warnings, supported }
  }

  if (type === 'map') {
    const mapName = typeof s['map'] === 'string' ? (s['map'] as string) : ''
    const found = getMap(mapName)
    if (found === null) warn('series-option-unsupported', 'series[0].map', 'Map "' + mapName + '" is not registered (call registerMap first); nothing was drawn.')
    const geo: GeoJson = found ?? { type: 'FeatureCollection', features: [] }
    const values: Record<string, Double> = {}
    for (let i = 0; i < data.length; i++) {
      const d = data[i]
      const v = isObj(d) ? num(d['value']) : null
      if (!isObj(d) || typeof d['name'] !== 'string' || v === null) {
        warn('series-data-shape', 'series[0].data[' + String(i) + ']', 'A map datum must be { name, value }; it was skipped.')
        continue
      }
      values[d['name'] as string] = v
    }
    const label = isObj(s['label']) ? s['label'] : {}
    const item = isObj(s['itemStyle']) ? s['itemStyle'] : {}
    const vm = first(option['visualMap'] as Record<string, unknown> | Record<string, unknown>[] | undefined)
    const stops = isObj(vm) && isObj(vm['inRange']) && Array.isArray(vm['inRange']['color'])
      ? (vm['inRange']['color'] as unknown[]).filter((c): c is string => typeof c === 'string')
      : []
    const vmMin = isObj(vm) ? num(vm['min']) : null
    const vmMax = isObj(vm) ? num(vm['max']) : null
    if (s['roam'] === true) warn('series-option-unsupported', 'series[0].roam', 'Map roaming (pan/zoom) is not supported yet; the map is static.')
    const options: GeoOptions = {
      showLabels: label['show'] === true,
      ...(typeof s['nameProperty'] === 'string' ? { nameProperty: s['nameProperty'] as string } : {}),
      ...(typeof item['borderColor'] === 'string' ? { borderColor: item['borderColor'] as string } : {}),
      ...(num(item['borderWidth']) !== null ? { borderWidth: num(item['borderWidth']) as number } : {}),
      ...(stops.length >= 2 ? { stops } : {}),
      ...(vmMin !== null && vmMax !== null ? { domain: [vmMin, vmMax] as [Double, Double] } : {}),
    }
    return { plan: { kind: 'map', geo, values, options, title }, warnings, supported }
  }

  if (type === 'themeRiver') {
    // Triples [date, value, name] group into one stream per name over the
    // sorted set of dates; a stream without a value on a date contributes 0.
    const dates = new Set<string>()
    const byName = new Map<string, Map<string, Double>>()
    for (let i = 0; i < data.length; i++) {
      const d = data[i]
      const v = Array.isArray(d) ? num(d[1]) : null
      if (!Array.isArray(d) || typeof d[0] !== 'string' || v === null || typeof d[2] !== 'string') {
        warn('series-data-shape', 'series[0].data[' + String(i) + ']', 'A themeRiver datum must be [date, value, name]; it was skipped.')
        continue
      }
      dates.add(d[0] as string)
      const row = byName.get(d[2] as string) ?? new Map<string, Double>()
      row.set(d[0] as string, (row.get(d[0] as string) ?? 0.0) + v)
      byName.set(d[2] as string, row)
    }
    const categories = Array.from(dates).sort()
    const series: RiverSeries[] = []
    for (const [name, row] of byName) series.push({ name, values: categories.map((c) => row.get(c) ?? 0.0) })
    const label = isObj(s['label']) ? s['label'] : {}
    const river: RiverOptions = { categories, showLabels: label['show'] !== false }
    return { plan: { kind: 'themeRiver', series, river, title }, warnings, supported }
  }

  if (familyKey === 'polar') {
    const angle = first(option['angleAxis'] as Record<string, unknown> | Record<string, unknown>[] | undefined)
    const radius = first(option['radiusAxis'] as Record<string, unknown> | Record<string, unknown>[] | undefined)
    const angleObj = isObj(angle) ? angle : {}
    const radiusObj = isObj(radius) ? radius : {}
    const catAxis = radiusObj['type'] === 'category' ? radiusObj : angleObj
    const valAxis = radiusObj['type'] === 'category' ? angleObj : radiusObj
    const categories = Array.isArray(catAxis['data']) ? (catAxis['data'] as unknown[]).map((c) => (typeof c === 'string' ? c : isObj(c) && typeof c['value'] === 'string' ? (c['value'] as string) : String(c))) : []
    const vmax = num(valAxis['max'])
    const vmin = num(valAxis['min'])
    const startDeg = num(angleObj['startAngle'])
    const axes: PolarAxes = {
      categories,
      categoryOn: radiusObj['type'] === 'category' ? 'radius' : 'angle',
      ...(vmax !== null ? { valueDomain: { min: vmin ?? 0.0, max: vmax } } : {}),
      ...(startDeg !== null ? { startAngle: (-startDeg * Math.PI) / 180.0 } : {}),
      ...(angleObj['clockwise'] === false ? { clockwise: false } : {}),
    }
    const series: PolarSeries[] = []
    for (let k = 0; k < seriesArr.length; k++) {
      const ser = seriesArr[k]
      if (!isObj(ser)) continue
      const st = ser['type']
      if (st !== 'bar' && st !== 'line') {
        warn('series-type-unsupported', 'series[' + String(k) + '].type', 'Only bar and line series render on the polar coordinate; ' + String(st) + ' was skipped.')
        continue
      }
      const rows = Array.isArray(ser['data']) ? (ser['data'] as unknown[]) : []
      const values: Double[] = []
      for (const d of rows) {
        const v = num(Array.isArray(d) ? d[0] : isObj(d) ? d['value'] : d)
        values.push(v === null ? NaN : v)
      }
      const item = isObj(ser['itemStyle']) ? ser['itemStyle'] : {}
      const line = isObj(ser['lineStyle']) ? ser['lineStyle'] : {}
      const color = typeof item['color'] === 'string' ? (item['color'] as string) : typeof line['color'] === 'string' ? (line['color'] as string) : undefined
      series.push({
        name: typeof ser['name'] === 'string' ? (ser['name'] as string) : 'Series ' + String(k + 1),
        kind: st,
        values,
        ...(color !== undefined ? { color } : {}),
        ...(typeof ser['stack'] === 'string' ? { stack: ser['stack'] as string } : {}),
      })
    }
    const pol = first(option['polar'] as Record<string, unknown> | Record<string, unknown>[] | undefined)
    let innerRatio = 0.0
    const pr = isObj(pol) ? pol['radius'] : undefined
    if (Array.isArray(pr) && pr.length === 2) {
      const inner = pct(pr[0])
      const outer = pct(pr[1])
      if (inner !== null && outer !== null && outer > 0.0) innerRatio = inner / outer
    }
    const polar: PolarOptions = { innerRatio }
    return { plan: { kind: 'polar', axes, series, polar, title }, warnings, supported }
  }

  if (type === 'parallel') {
    const rawAxes = Array.isArray(option['parallelAxis']) ? (option['parallelAxis'] as unknown[]) : []
    const axes: ParallelAxis[] = []
    for (let i = 0; i < rawAxes.length; i++) {
      const a = rawAxes[i]
      const ao = isObj(a) ? a : {}
      const dim = num(ao['dim'])
      const at = dim !== null ? dim : i
      const lo = num(ao['min'])
      const hi = num(ao['max'])
      const cats = Array.isArray(ao['data']) ? (ao['data'] as unknown[]).map((c) => (typeof c === 'string' ? c : isObj(c) && typeof c['value'] === 'string' ? (c['value'] as string) : String(c))) : undefined
      axes[at] = {
        name: typeof ao['name'] === 'string' ? (ao['name'] as string) : 'dim ' + String(at),
        ...(ao['type'] === 'category' ? { type: 'category' as const, categories: cats ?? [] } : {}),
        ...(ao['type'] !== 'category' && lo !== null && hi !== null ? { domain: [lo, hi] as [Double, Double] } : {}),
        ...(ao['inverse'] === true ? { inverse: true } : {}),
      }
    }
    for (let i = 0; i < axes.length; i++) if (axes[i] === undefined) axes[i] = { name: 'dim ' + String(i) }
    const par = first(option['parallel'] as Record<string, unknown> | Record<string, unknown>[] | undefined)
    if (isObj(par) && par['layout'] === 'vertical') warn('series-option-unsupported', 'parallel.layout', 'A vertical parallel layout is not supported yet; rendered horizontally.')
    const rows: ParallelRow[] = []
    for (let i = 0; i < data.length; i++) {
      const d = data[i]
      const arr = Array.isArray(d) ? d : isObj(d) && Array.isArray(d['value']) ? (d['value'] as unknown[]) : null
      if (arr === null) {
        warn('series-data-shape', 'series[0].data[' + String(i) + ']', 'A parallel datum must be an array of one value per axis; it was skipped.')
        continue
      }
      rows.push(arr.map((v) => (typeof v === 'number' || typeof v === 'string' ? v : null)))
    }
    const ls = isObj(s['lineStyle']) ? s['lineStyle'] : {}
    const lw = num(ls['width'])
    const lo = num(ls['opacity'])
    const parallel: ParallelOptions = {
      ...(lw !== null ? { lineWidth: lw } : {}),
      ...(lo !== null ? { lineOpacity: lo } : {}),
      ...(typeof ls['color'] === 'string' ? { lineColor: ls['color'] as string } : {}),
    }
    return { plan: { kind: 'parallel', axes, rows, parallel, title }, warnings, supported }
  }

  if (type === 'heatmap' && s['coordinateSystem'] === 'calendar') {
    const cal = first(option['calendar'] as Record<string, unknown> | Record<string, unknown>[] | undefined)
    const calObj = isObj(cal) ? cal : {}
    let start = ''
    let end = ''
    const range = calObj['range']
    const year = (y: number): [string, string] => [String(y) + '-01-01', String(y) + '-12-31']
    if (typeof range === 'number') [start, end] = year(range)
    else if (typeof range === 'string' && /^\d{4}$/.test(range)) [start, end] = year(Number(range))
    else if (typeof range === 'string' && /^\d{4}-\d{2}$/.test(range)) {
      const y = Number(range.slice(0, 4))
      const mo = Number(range.slice(5, 7))
      const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate()
      start = range + '-01'
      end = range + '-' + (lastDay < 10 ? '0' : '') + String(lastDay)
    } else if (typeof range === 'string') [start, end] = [range, range]
    else if (Array.isArray(range) && range.length === 2 && typeof range[0] === 'string' && typeof range[1] === 'string') [start, end] = [range[0], range[1]]
    else warn('series-option-unsupported', 'calendar.range', 'calendar.range must be a year, a "YYYY-MM", a date, or [start, end]; nothing was laid out.')
    if (calObj['orient'] === 'vertical') warn('series-option-unsupported', 'calendar.orient', 'A vertical calendar is not supported yet; rendered horizontally.')
    const values: Record<string, Double> = {}
    for (let i = 0; i < data.length; i++) {
      const d = data[i]
      const pair = Array.isArray(d) ? d : isObj(d) && Array.isArray(d['value']) ? (d['value'] as unknown[]) : null
      const date = pair !== null && typeof pair[0] === 'string' ? pair[0] : null
      const v = pair !== null ? num(pair[1]) : null
      if (date === null || v === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        warn('series-data-shape', 'series[0].data[' + String(i) + ']', 'A calendar heatmap datum must be [YYYY-MM-DD, value]; it was skipped.')
        continue
      }
      values[date] = v
    }
    const dayLabel = isObj(calObj['dayLabel']) ? calObj['dayLabel'] : {}
    const monthLabel = isObj(calObj['monthLabel']) ? calObj['monthLabel'] : {}
    const cellRaw = calObj['cellSize']
    const cellSize = Array.isArray(cellRaw) ? num(cellRaw[0]) : num(cellRaw)
    const firstDay = num(dayLabel['firstDay'])
    const vm = first(option['visualMap'] as Record<string, unknown> | Record<string, unknown>[] | undefined)
    const stops = isObj(vm) && isObj(vm['inRange']) && Array.isArray(vm['inRange']['color'])
      ? (vm['inRange']['color'] as unknown[]).filter((c): c is string => typeof c === 'string')
      : []
    const vmMin = isObj(vm) ? num(vm['min']) : null
    const vmMax = isObj(vm) ? num(vm['max']) : null
    const calendar: CalendarOptions = {
      showDayLabels: dayLabel['show'] !== false,
      showMonthLabels: monthLabel['show'] !== false,
      ...(cellSize !== null ? { cellSize } : {}),
      ...(firstDay !== null ? { firstDay } : {}),
      ...(stops.length >= 2 ? { stops } : {}),
      ...(vmMin !== null && vmMax !== null ? { domain: [vmMin, vmMax] as [Double, Double] } : {}),
    }
    return { plan: { kind: 'calendar', start, end, values, calendar, title }, warnings, supported }
  }

  if (type === 'graph') {
    const rawNodes = Array.isArray(s['nodes']) ? (s['nodes'] as unknown[]) : data
    const nodes: GraphNode[] = []
    for (let i = 0; i < rawNodes.length; i++) {
      const d = rawNodes[i]
      if (!isObj(d)) {
        warn('series-data-shape', 'series[0].data[' + String(i) + ']', 'A graph node must be an object; it was skipped.')
        continue
      }
      const id = typeof d['id'] === 'string' ? (d['id'] as string) : typeof d['id'] === 'number' ? String(d['id']) : typeof d['name'] === 'string' ? (d['name'] as string) : 'Node ' + String(i + 1)
      const item = isObj(d['itemStyle']) ? d['itemStyle'] : {}
      const v = num(d['value'])
      const cat = num(d['category'])
      const x = num(d['x'])
      const y = num(d['y'])
      nodes.push({
        id,
        ...(typeof d['name'] === 'string' ? { name: d['name'] as string } : {}),
        ...(v !== null ? { value: v } : {}),
        ...(cat !== null ? { category: cat } : {}),
        ...(typeof item['color'] === 'string' ? { color: item['color'] as string } : {}),
        ...(x !== null ? { x } : {}),
        ...(y !== null ? { y } : {}),
      })
    }
    const rawLinks = Array.isArray(s['links']) ? (s['links'] as unknown[]) : Array.isArray(s['edges']) ? (s['edges'] as unknown[]) : []
    const endpoint = (v: unknown): string | null => (typeof v === 'string' ? v : typeof v === 'number' && nodes[v] !== undefined ? nodes[v]!.id : null)
    const links: GraphLink[] = []
    for (let i = 0; i < rawLinks.length; i++) {
      const d = rawLinks[i]
      const src = isObj(d) ? endpoint(d['source']) : null
      const tgt = isObj(d) ? endpoint(d['target']) : null
      if (!isObj(d) || src === null || tgt === null) {
        warn('series-data-shape', 'series[0].links[' + String(i) + ']', 'A graph link needs a source and a target (name or index); it was skipped.')
        continue
      }
      const v = num(d['value'])
      links.push({ source: src, target: tgt, ...(v !== null ? { value: v } : {}) })
    }
    const label = isObj(s['label']) ? s['label'] : {}
    const cats = Array.isArray(s['categories']) ? (s['categories'] as unknown[]).map((c, i) => (isObj(c) && typeof c['name'] === 'string' ? (c['name'] as string) : typeof c === 'string' ? c : 'Category ' + String(i + 1))) : undefined
    if (typeof s['symbolSize'] === 'function') warn('series-option-unsupported', 'series[0].symbolSize', 'A symbolSize FUNCTION is not supported; pass a number or per-node values.')
    const symbolSize = num(s['symbolSize'])
    const force = isObj(s['force']) ? s['force'] : {}
    const repulsion = Array.isArray(force['repulsion']) ? num((force['repulsion'] as unknown[])[0]) : num(force['repulsion'])
    const edgeLength = Array.isArray(force['edgeLength']) ? num((force['edgeLength'] as unknown[])[0]) : num(force['edgeLength'])
    const gravity = num(force['gravity'])
    const layoutRaw = s['layout']
    const graph: GraphOptions = {
      layout: layoutRaw === 'circular' ? 'circular' : layoutRaw === 'none' ? 'none' : 'force',
      showLabels: label['show'] === true,
      ...(cats !== undefined ? { categories: cats } : {}),
      ...(symbolSize !== null ? { symbolSize } : {}),
      ...(repulsion !== null ? { repulsion } : {}),
      ...(edgeLength !== null ? { linkDistance: edgeLength } : {}),
      ...(gravity !== null ? { gravity } : {}),
    }
    return { plan: { kind: 'graph', nodes, links, graph, title }, warnings, supported }
  }

  if (type === 'sankey') {
    const rawNodes = Array.isArray(s['nodes']) ? (s['nodes'] as unknown[]) : data
    const nodes: SankeyNode[] = []
    for (let i = 0; i < rawNodes.length; i++) {
      const d = rawNodes[i]
      if (!isObj(d) || typeof d['name'] !== 'string') {
        warn('series-data-shape', 'series[0].data[' + String(i) + ']', 'A sankey node must be an object with a name; it was skipped.')
        continue
      }
      const item = isObj(d['itemStyle']) ? d['itemStyle'] : {}
      nodes.push({ name: d['name'] as string, ...(typeof item['color'] === 'string' ? { color: item['color'] as string } : {}) })
    }
    const rawLinks = Array.isArray(s['links']) ? (s['links'] as unknown[]) : Array.isArray(s['edges']) ? (s['edges'] as unknown[]) : []
    const links: SankeyLink[] = []
    for (let i = 0; i < rawLinks.length; i++) {
      const d = rawLinks[i]
      const v = isObj(d) ? num(d['value']) : null
      if (!isObj(d) || typeof d['source'] !== 'string' || typeof d['target'] !== 'string' || v === null) {
        warn('series-data-shape', 'series[0].links[' + String(i) + ']', 'A sankey link needs string source/target and a numeric value; it was skipped.')
        continue
      }
      links.push({ source: d['source'] as string, target: d['target'] as string, value: v })
    }
    if (s['orient'] === 'vertical') warn('series-option-unsupported', 'series[0].orient', 'Vertical sankey is not supported yet; rendered horizontally.')
    const label = isObj(s['label']) ? s['label'] : {}
    const nodeWidth = num(s['nodeWidth'])
    const nodeGap = num(s['nodeGap'])
    const iterations = num(s['layoutIterations'])
    const sankey: SankeyOptions = {
      showLabels: label['show'] !== false,
      ...(nodeWidth !== null ? { nodeWidth } : {}),
      ...(nodeGap !== null ? { nodePadding: nodeGap } : {}),
      ...(iterations !== null ? { iterations } : {}),
      ...(s['nodeAlign'] === 'left' ? { align: 'left' as const } : {}),
    }
    return { plan: { kind: 'sankey', nodes, links, sankey, title }, warnings, supported }
  }

  if (type === 'tree') {
    const toNode = (d: unknown, i: number): TreeNode | null => {
      if (!isObj(d)) return null
      const kids = Array.isArray(d['children']) ? (d['children'] as unknown[]).map((c, j) => toNode(c, j)).filter((c): c is TreeNode => c !== null) : undefined
      const v = num(d['value'])
      const item = isObj(d['itemStyle']) ? d['itemStyle'] : {}
      const name = typeof d['name'] === 'string' ? (d['name'] as string) : 'Node ' + String(i + 1)
      return {
        name,
        ...(v !== null ? { value: v } : {}),
        ...(kids !== undefined && kids.length > 0 ? { children: kids } : {}),
        ...(typeof item['color'] === 'string' ? { color: item['color'] as string } : {}),
      }
    }
    const nodes: TreeNode[] = []
    for (let i = 0; i < data.length; i++) {
      const n = toNode(data[i], i)
      if (n === null) warn('series-data-shape', 'series[0].data[' + String(i) + ']', 'A tree datum must be an object; it was skipped.')
      else nodes.push(n)
    }
    const label = isObj(s['label']) ? s['label'] : {}
    const orientRaw = s['orient']
    const orientMap: Record<string, TreeOrient> = { LR: 'LR', RL: 'RL', TB: 'TB', BT: 'BT', horizontal: 'LR', vertical: 'TB' }
    const orient: TreeOrient = s['layout'] === 'radial' ? 'radial' : (typeof orientRaw === 'string' ? orientMap[orientRaw] : undefined) ?? 'LR'
    const symbolSize = num(s['symbolSize'])
    const initialDepth = num(s['initialTreeDepth'])
    const tree: TreeOptions = {
      orient,
      showLabels: label['show'] !== false,
      ...(symbolSize !== null ? { symbolSize } : {}),
      ...(initialDepth !== null && initialDepth >= 0 ? { maxDepth: initialDepth + 1 } : {}),
      ...(s['edgeShape'] === 'polyline' ? { edgeShape: 'elbow' as const } : {}),
    }
    return { plan: { kind: 'tree', nodes, tree, title }, warnings, supported }
  }

  if (type === 'sunburst') {
    const toNode = (d: unknown, i: number): TreeNode | null => {
      if (!isObj(d)) return null
      const kids = Array.isArray(d['children']) ? (d['children'] as unknown[]).map((c, j) => toNode(c, j)).filter((c): c is TreeNode => c !== null) : undefined
      const v = num(d['value'])
      const item = isObj(d['itemStyle']) ? d['itemStyle'] : {}
      const name = typeof d['name'] === 'string' ? (d['name'] as string) : 'Node ' + String(i + 1)
      return {
        name,
        ...(v !== null ? { value: v } : {}),
        ...(kids !== undefined && kids.length > 0 ? { children: kids } : {}),
        ...(typeof item['color'] === 'string' ? { color: item['color'] as string } : {}),
      }
    }
    const nodes: TreeNode[] = []
    for (let i = 0; i < data.length; i++) {
      const n = toNode(data[i], i)
      if (n === null) warn('series-data-shape', 'series[0].data[' + String(i) + ']', 'A sunburst datum must be an object; it was skipped.')
      else nodes.push(n)
    }
    const label = isObj(s['label']) ? s['label'] : {}
    // ECharts: radius ['25%', '90%'] — the hole is the inner/outer ratio; a
    // single value is the outer radius with no hole. startAngle is degrees,
    // counter-clockwise from 3 o'clock (90 = 12 o'clock); we sweep clockwise.
    let innerRatio = 0.2
    const radius = s['radius']
    if (Array.isArray(radius) && radius.length === 2) {
      const inner = pct(radius[0])
      const outer = pct(radius[1])
      if (inner !== null && outer !== null && outer > 0.0) innerRatio = inner / outer
    } else if (radius !== undefined) innerRatio = 0.0
    const startDeg = num(s['startAngle'])
    const sunburst: SunburstOptions = {
      showLabels: label['show'] !== false,
      ...(s['sort'] === null || s['sort'] === 'none' ? { sort: 'none' as const } : {}),
      ...(startDeg !== null ? { startAngle: (-startDeg * Math.PI) / 180.0 } : {}),
    }
    return { plan: { kind: 'sunburst', nodes, innerRatio, sunburst, title }, warnings, supported }
  }

  if (type === 'treemap') {
    const toNode = (d: unknown, i: number): TreeNode | null => {
      if (!isObj(d)) return null
      const kids = Array.isArray(d['children']) ? (d['children'] as unknown[]).map((c, j) => toNode(c, j)).filter((c): c is TreeNode => c !== null) : undefined
      const v = num(d['value'])
      const item = isObj(d['itemStyle']) ? d['itemStyle'] : {}
      const name = typeof d['name'] === 'string' ? (d['name'] as string) : 'Node ' + String(i + 1)
      return {
        name,
        ...(v !== null ? { value: v } : {}),
        ...(kids !== undefined && kids.length > 0 ? { children: kids } : {}),
        ...(typeof item['color'] === 'string' ? { color: item['color'] as string } : {}),
      }
    }
    const nodes: TreeNode[] = []
    for (let i = 0; i < data.length; i++) {
      const n = toNode(data[i], i)
      if (n === null) warn('series-data-shape', 'series[0].data[' + String(i) + ']', 'A treemap datum must be an object; it was skipped.')
      else nodes.push(n)
    }
    const label = isObj(s['label']) ? s['label'] : {}
    const depth = num(s['leafDepth'])
    const treemap: TreemapOptions = {
      showLabels: label['show'] !== false,
      ...(depth !== null ? { maxDepth: depth } : {}),
    }
    return { plan: { kind: 'treemap', nodes, treemap, title }, warnings, supported }
  }

  if (type === 'funnel') {
    const rows: { value: Double; name: string; color: string | undefined }[] = []
    for (let i = 0; i < data.length; i++) {
      const d = data[i]
      const v = isObj(d) ? num(d['value']) : num(d)
      if (v === null) {
        warn('series-data-shape', `series[0].data[${i}]`, 'A funnel datum needs a numeric value; it was skipped.')
        continue
      }
      const item = isObj(d) && isObj(d['itemStyle']) ? d['itemStyle'] : {}
      rows.push({
        value: v,
        name: isObj(d) && typeof d['name'] === 'string' ? (d['name'] as string) : `Stage ${i + 1}`,
        color: typeof item['color'] === 'string' ? (item['color'] as string) : palette[i % Math.max(1, palette.length)],
      })
    }
    const sortRaw = s['sort']
    const sort: FunnelOptions['sort'] = sortRaw === 'ascending' ? 'ascending' : sortRaw === 'none' ? 'none' : 'descending'
    const minSize = pct(s['minSize'])
    const alignRaw = s['funnelAlign']
    const label = isObj(s['label']) ? s['label'] : {}
    const funnel: FunnelOptions = {
      sort,
      gap: num(s['gap']) ?? 2.0,
      minWidthRatio: minSize === null ? 0.0 : minSize / 100.0,
      align: alignRaw === 'left' ? 'left' : alignRaw === 'right' ? 'right' : 'center',
      showLabels: label['show'] !== false,
    }
    return { plan: { kind: 'funnel', rows, funnel, title }, warnings, supported }
  }

  // heatmap
  const xAxis = first(option['xAxis'] as Record<string, unknown> | Record<string, unknown>[] | undefined)
  const yAxis = first(option['yAxis'] as Record<string, unknown> | Record<string, unknown>[] | undefined)
  const xs = isObj(xAxis) && Array.isArray(xAxis['data']) ? (xAxis['data'] as unknown[]).map((c) => String(c)) : []
  const ys = isObj(yAxis) && Array.isArray(yAxis['data']) ? (yAxis['data'] as unknown[]).map((c) => String(c)) : []
  const rows: { x: string; y: string; value: Double }[] = []
  for (let i = 0; i < data.length; i++) {
    const d = data[i]
    const arr = Array.isArray(d) ? d : isObj(d) && Array.isArray(d['value']) ? (d['value'] as unknown[]) : null
    if (arr === null || arr.length < 3) {
      warn('series-data-shape', `series[0].data[${i}]`, 'A heatmap datum is [xIndex, yIndex, value]; it was skipped.')
      continue
    }
    const xi = num(arr[0])
    const yi = num(arr[1])
    rows.push({
      x: xi !== null && xs[xi] !== undefined ? xs[xi]! : String(arr[0]),
      y: yi !== null && ys[yi] !== undefined ? ys[yi]! : String(arr[1]),
      value: num(arr[2]) ?? 0.0,
    })
  }
  const vm = first(option['visualMap'] as Record<string, unknown> | Record<string, unknown>[] | undefined)
  const colors = isObj(vm) && isObj(vm['inRange']) && Array.isArray(vm['inRange']['color'])
    ? (vm['inRange']['color'] as unknown[]).filter((c): c is string => typeof c === 'string')
    : undefined
  return { plan: { kind: 'heatmap', rows, colors, title }, warnings, supported }
}

/** Render a compiled family plan to an `<svg>` string. */
export function familyToSvg(plan: FamilyPlan, size: { width?: Double | undefined; height?: Double | undefined } = {}): string {
  const width = size.width ?? 640.0
  const height = size.height ?? 320.0
  switch (plan.kind) {
    case 'pie': {
      const hasColors = plan.rows.some((r) => r.color !== undefined)
      return pieToSvg({
        data: plan.rows,
        value: (d) => d.value,
        label: (d) => d.name,
        ...(hasColors ? { color: (d: { color: string | undefined }, i: number) => d.color ?? PALETTE[i % PALETTE.length]! } : {}),
        innerRadius: plan.innerRadius,
        showLabels: plan.showLabels,
        showLegend: plan.showLegend,
        width,
        height,
        ...(plan.title !== undefined ? { title: plan.title } : {}),
      })
    }
    case 'gauge':
      return gaugeToSvg({
        value: plan.value,
        min: plan.min,
        max: plan.max,
        showValue: plan.showValue,
        width,
        height,
        ...(plan.thickness !== undefined ? { thickness: plan.thickness } : {}),
        ...(plan.valueColor !== undefined ? { valueColor: plan.valueColor } : {}),
        ...(plan.title !== undefined ? { title: plan.title } : {}),
      })
    case 'radar': {
      const hasColors = plan.rows.some((r) => r.color !== undefined)
      return radarToSvg({
        data: plan.rows,
        axes: plan.axes,
        values: (d) => d.values,
        label: (d) => d.name,
        ...(hasColors ? { color: (d: { color: string | undefined }, i: number) => d.color ?? PALETTE[i % PALETTE.length]! } : {}),
        fillAlpha: plan.fillAlpha,
        showLegend: plan.showLegend,
        width,
        height,
        ...(plan.title !== undefined ? { title: plan.title } : {}),
      })
    }
    case 'candlestick':
      return candlestickToSvg({
        data: plan.rows,
        x: (d) => d.x,
        open: (d) => d.open,
        high: (d) => d.high,
        low: (d) => d.low,
        close: (d) => d.close,
        candle: { upColor: plan.upColor, downColor: plan.downColor },
        width,
        height,
        ...(plan.title !== undefined ? { title: plan.title } : {}),
      })
    case 'funnel': {
      const hasColors = plan.rows.some((r) => r.color !== undefined)
      return funnelToSvg({
        data: plan.rows,
        value: (d) => d.value,
        label: (d) => d.name,
        ...(hasColors ? { color: (d: { color: string | undefined }, i: number) => d.color ?? PALETTE[i % PALETTE.length]! } : {}),
        funnel: plan.funnel,
        width,
        height,
        ...(plan.title !== undefined ? { title: plan.title } : {}),
      })
    }
    case 'singleAxis':
      return singleAxisToSvg({
        axis: plan.axis,
        points: plan.points,
        options: plan.options,
        width,
        height,
        ...(plan.title !== undefined ? { title: plan.title } : {}),
      })
    case 'geoPoints':
      return geoPointsToSvg({
        geo: plan.geo,
        points: plan.points,
        paths: plan.paths,
        map: plan.map,
        options: plan.options,
        width,
        height,
        ...(plan.title !== undefined ? { title: plan.title } : {}),
      })
    case 'map':
      return geoToSvg({
        geo: plan.geo,
        values: plan.values,
        options: plan.options,
        width,
        height,
        ...(plan.title !== undefined ? { title: plan.title } : {}),
      })
    case 'themeRiver':
      return riverToSvg({
        series: plan.series,
        river: plan.river,
        width,
        height,
        ...(plan.title !== undefined ? { title: plan.title } : {}),
      })
    case 'polar':
      return polarToSvg({
        axes: plan.axes,
        series: plan.series,
        polar: plan.polar,
        width,
        height,
        ...(plan.title !== undefined ? { title: plan.title } : {}),
      })
    case 'parallel':
      return parallelToSvg({
        axes: plan.axes,
        rows: plan.rows,
        parallel: plan.parallel,
        width,
        height,
        ...(plan.title !== undefined ? { title: plan.title } : {}),
      })
    case 'calendar':
      return calendarToSvg({
        start: plan.start,
        end: plan.end,
        values: plan.values,
        calendar: plan.calendar,
        width,
        height,
        ...(plan.title !== undefined ? { title: plan.title } : {}),
      })
    case 'graph':
      return graphToSvg({
        nodes: plan.nodes,
        links: plan.links,
        graph: plan.graph,
        width,
        height,
        ...(plan.title !== undefined ? { title: plan.title } : {}),
      })
    case 'sankey':
      return sankeyToSvg({
        nodes: plan.nodes,
        links: plan.links,
        sankey: plan.sankey,
        width,
        height,
        ...(plan.title !== undefined ? { title: plan.title } : {}),
      })
    case 'tree':
      return treeToSvg({
        data: plan.nodes,
        tree: plan.tree,
        width,
        height,
        ...(plan.title !== undefined ? { title: plan.title } : {}),
      })
    case 'sunburst':
      return sunburstToSvg({
        data: plan.nodes,
        innerRatio: plan.innerRatio,
        sunburst: plan.sunburst,
        width,
        height,
        ...(plan.title !== undefined ? { title: plan.title } : {}),
      })
    case 'treemap':
      return treemapToSvg({
        data: plan.nodes,
        treemap: plan.treemap,
        width,
        height,
        ...(plan.title !== undefined ? { title: plan.title } : {}),
      })
    default:
      return heatmapToSvg({
        data: plan.rows,
        x: (d) => d.x,
        y: (d) => d.y,
        value: (d) => d.value,
        ...(plan.colors !== undefined && plan.colors.length > 1 ? { colors: plan.colors } : {}),
        width,
        height,
        ...(plan.title !== undefined ? { title: plan.title } : {}),
      })
  }
}

const PALETTE = ['#0f766e', '#b45309', '#1d4ed8', '#b42318', '#15803d', '#7c3aed']
