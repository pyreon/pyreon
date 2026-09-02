// The ECharts option-compat facade.
//
// Accepts an ECharts-SHAPED option object and compiles it onto the engine:
// series → `Series[]`, axes → domains/categories/formatters, markLine →
// annotations, markPoint → markers, title/legend/tooltip → host hints. It
// exists so that "an ECharts alternative" includes the experience of WRITING
// ECharts options, and so that parity can be MEASURED: the conformance corpus
// runs real gallery-shaped options through here and counts what renders.
//
// Two rules keep it honest. Nothing is silently dropped: every unmapped key,
// series type or value shape becomes a named `OptionWarning` with a JSON-ish
// path, so a caller (or the conformance suite) can see exactly what did not
// cross. And it is DATA in, DATA out — no console, no DOM — so it runs on the
// server and in a test the same way the engine does.

import { defaultTheme, renderChart } from './render'
import type { Annotation, ChartSpec, PointMarker, Series } from './render'
import { smooth, step } from './curve'
import type { Formatter } from './format'
import { renderLegend } from './legend'
import type { LegendEntry } from './legend'
import { measureApprox, renderSvg } from './svg'
import type { DrawCmd, Domain, Double, MeasureText } from './types'

/** An ECharts-shaped option. Loosely typed on purpose: the facade VALIDATES. */
export type EChartsOption = Record<string, unknown>

export interface OptionWarning {
  /** Stable, greppable code — what an agent or a test branches on. */
  code:
    | 'option-key-unsupported'
    | 'series-type-unsupported'
    | 'series-data-shape'
    | 'axis-formatter-template'
    | 'axis-count-unsupported'
    | 'series-option-unsupported'
    | 'mark-shape-unsupported'
  /** Where in the option, e.g. `series[2].type`. */
  path: string
  message: string
}

export interface CompiledOption {
  spec: ChartSpec
  /** Title text + sub-text, when the option carries them. */
  title: { text: string; subtext: string | undefined } | null
  /** Legend entries, or null when the option hides the legend. */
  legend: LegendEntry[] | null
  tooltip: boolean
  warnings: OptionWarning[]
  /**
   * False when a series could not be mapped at all. A chart missing one of
   * its series is a different chart, so the whole option is reported as not
   * rendering faithfully — the conformance metric counts it as a miss.
   */
  supported: boolean
}

export interface CompileOptions {
  width?: Double
  height?: Double
}

const KNOWN_TOP = new Set([
  'series', 'xAxis', 'yAxis', 'title', 'legend', 'tooltip', 'color', 'grid',
  'animation', 'backgroundColor', 'textStyle',
])
const KNOWN_SERIES = new Set([
  'type', 'name', 'data', 'stack', 'smooth', 'step', 'areaStyle', 'itemStyle',
  'lineStyle', 'symbolSize', 'label', 'yAxisIndex', 'markLine', 'markPoint',
  'color', 'showSymbol', 'symbol', 'emphasis', 'z', 'zlevel', 'silent',
])

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}
const first = <T,>(v: T | T[] | undefined): T | undefined => (Array.isArray(v) ? v[0] : v)

/** Compile an ECharts-shaped option onto the engine. Pure. */
export function compileOption(option: EChartsOption, opts: CompileOptions = {}): CompiledOption {
  const warnings: OptionWarning[] = []
  const warn = (code: OptionWarning['code'], path: string, message: string): void => {
    warnings.push({ code, path, message })
  }
  let supported = true

  for (const key of Object.keys(option)) {
    if (!KNOWN_TOP.has(key)) {
      warn('option-key-unsupported', key, `"${key}" has no mapping yet; it was ignored.`)
    }
  }

  // ---- axes -----------------------------------------------------------
  const xAxisRaw = option['xAxis']
  if (Array.isArray(xAxisRaw) && xAxisRaw.length > 1) {
    warn('axis-count-unsupported', 'xAxis', 'Only one x axis is supported; extra axes were ignored.')
  }
  const xAxis = first(xAxisRaw as Record<string, unknown> | Record<string, unknown>[] | undefined)
  const xType = isObj(xAxis) && typeof xAxis['type'] === 'string' ? (xAxis['type'] as string) : undefined
  const categories: string[] = []
  if (isObj(xAxis) && Array.isArray(xAxis['data'])) {
    for (const c of xAxis['data'] as unknown[]) categories.push(isObj(c) ? String(c['value'] ?? '') : String(c))
  }
  const xTime = xType === 'time'
  const xContinuous = xType === 'value' || xTime
  const xFormat = axisFormatter(xAxis, 'xAxis', warn)

  const yAxisRaw = option['yAxis']
  const yAxes: Record<string, unknown>[] = Array.isArray(yAxisRaw)
    ? (yAxisRaw as unknown[]).filter(isObj)
    : isObj(yAxisRaw)
      ? [yAxisRaw]
      : []
  if (yAxes.length > 2) warn('axis-count-unsupported', 'yAxis', 'At most two y axes are supported; extras were ignored.')
  const yDomain = axisDomain(yAxes[0])
  const y2Domain = axisDomain(yAxes[1])
  const yFormat = axisFormatter(yAxes[0], 'yAxis[0]', warn)
  const y2Format = axisFormatter(yAxes[1], 'yAxis[1]', warn)

  // ---- palette --------------------------------------------------------
  const palette: string[] = Array.isArray(option['color'])
    ? (option['color'] as unknown[]).filter((c): c is string => typeof c === 'string')
    : []

  // ---- series ---------------------------------------------------------
  const rawSeries = Array.isArray(option['series'])
    ? (option['series'] as unknown[])
    : isObj(option['series'])
      ? [option['series']]
      : []
  const series: Series[] = []
  const annotations: Annotation[] = []
  const markers: PointMarker[] = []
  let xValues: Double[] | undefined = undefined
  const barCount = rawSeries.filter((s) => isObj(s) && s['type'] === 'bar' && s['stack'] === undefined).length

  for (let i = 0; i < rawSeries.length; i++) {
    const s = rawSeries[i]
    const path = `series[${i}]`
    if (!isObj(s)) {
      warn('series-data-shape', path, 'A series must be an object.')
      supported = false
      continue
    }
    for (const key of Object.keys(s)) {
      if (!KNOWN_SERIES.has(key)) warn('series-option-unsupported', `${path}.${key}`, `"${key}" has no mapping yet; it was ignored.`)
    }
    const type = typeof s['type'] === 'string' ? (s['type'] as string) : ''
    let kind: Series['kind']
    if (type === 'bar') kind = s['stack'] !== undefined ? 'stacked' : barCount > 1 ? 'grouped' : 'bars'
    else if (type === 'line') kind = isObj(s['areaStyle']) || s['areaStyle'] === true ? 'area' : 'line'
    else if (type === 'scatter') kind = 'points'
    else {
      warn('series-type-unsupported', `${path}.type`, `Series type "${type}" is not mapped by this facade yet (cartesian family only).`)
      supported = false
      continue
    }
    if (type === 'line' && s['stack'] !== undefined) {
      warn('series-option-unsupported', `${path}.stack`, 'Stacked LINES are not supported; the line was drawn unstacked.')
    }

    // Data: number[] | {value}[] | [x, y][] (pairs feed a continuous x).
    const values: Double[] = []
    const xs: Double[] = []
    const data = Array.isArray(s['data']) ? (s['data'] as unknown[]) : []
    if (!Array.isArray(s['data'])) warn('series-data-shape', `${path}.data`, 'Series data must be an array; treated as empty.')
    for (let j = 0; j < data.length; j++) {
      const d = data[j]
      if (Array.isArray(d) && d.length >= 2) {
        const x = num(d[0])
        const y = num(d[1])
        if (x === null || y === null) {
          warn('series-data-shape', `${path}.data[${j}]`, 'A [x, y] pair must be numeric; the point was zeroed.')
          xs.push(j)
          values.push(0.0)
        } else {
          xs.push(x)
          values.push(y)
        }
      } else if (isObj(d)) {
        const v = num(d['value'])
        if (v === null) warn('series-data-shape', `${path}.data[${j}].value`, 'Non-numeric value; the point was zeroed.')
        values.push(v ?? 0.0)
      } else {
        const v = num(d)
        if (v === null) warn('series-data-shape', `${path}.data[${j}]`, 'Non-numeric datum; the point was zeroed.')
        values.push(v ?? 0.0)
      }
    }
    if (xContinuous && xs.length === values.length && xs.length > 0 && xValues === undefined) xValues = xs

    const itemStyle = isObj(s['itemStyle']) ? s['itemStyle'] : {}
    const lineStyle = isObj(s['lineStyle']) ? s['lineStyle'] : {}
    const color =
      typeof itemStyle['color'] === 'string'
        ? (itemStyle['color'] as string)
        : typeof lineStyle['color'] === 'string'
          ? (lineStyle['color'] as string)
          : typeof s['color'] === 'string'
            ? (s['color'] as string)
            : palette[series.length % Math.max(1, palette.length)] ?? defaultPalette[series.length % defaultPalette.length]!
    const label = isObj(s['label']) ? s['label'] : {}
    const yAxisIndex = num(s['yAxisIndex']) ?? 0
    if (yAxisIndex > 1) warn('axis-count-unsupported', `${path}.yAxisIndex`, 'Only yAxisIndex 0 or 1 is supported.')

    const entry: Series = {
      kind,
      values,
      color,
      width: num(lineStyle['width']) ?? 2.0,
      radius: num(s['symbolSize']) !== null ? (num(s['symbolSize']) as number) / 2.0 : 3.0,
      label: typeof s['name'] === 'string' ? (s['name'] as string) : `Series ${i + 1}`,
      curve: s['smooth'] === true || (num(s['smooth']) ?? 0) > 0 ? smooth : s['step'] !== undefined && s['step'] !== false ? step : undefined,
      showValues: label['show'] === true,
      radii: undefined,
      axis: yAxisIndex === 1 ? 'right' : undefined,
    }
    series.push(entry)
    const seriesIndex = series.length - 1

    // markLine → annotations; markPoint → markers.
    const ml = isObj(s['markLine']) && Array.isArray(s['markLine']['data']) ? (s['markLine']['data'] as unknown[]) : []
    for (let k = 0; k < ml.length; k++) {
      const m = ml[k]
      if (!isObj(m)) continue
      const name = typeof m['name'] === 'string' ? (m['name'] as string) : undefined
      if (m['type'] === 'average' || m['type'] === 'max' || m['type'] === 'min') {
        const stat =
          m['type'] === 'average'
            ? values.reduce((a, b) => a + b, 0.0) / Math.max(1, values.length)
            : m['type'] === 'max'
              ? Math.max(...values)
              : Math.min(...values)
        annotations.push({ y: stat, label: name ?? String(m['type']), color })
      } else if (num(m['yAxis']) !== null) {
        annotations.push({ y: num(m['yAxis']) as number, label: name, color })
      } else if (num(m['xAxis']) !== null) {
        annotations.push({ x: num(m['xAxis']) as number, label: name, color })
      } else {
        warn('mark-shape-unsupported', `${path}.markLine.data[${k}]`, 'Only average/max/min, yAxis and xAxis markLines are mapped.')
      }
    }
    const mp = isObj(s['markPoint']) && Array.isArray(s['markPoint']['data']) ? (s['markPoint']['data'] as unknown[]) : []
    for (let k = 0; k < mp.length; k++) {
      const m = mp[k]
      if (!isObj(m)) continue
      const name = typeof m['name'] === 'string' ? (m['name'] as string) : undefined
      if (m['type'] === 'max' || m['type'] === 'min') {
        markers.push({ seriesIndex, at: m['type'] as 'max' | 'min', label: name })
      } else if (Array.isArray(m['coord']) && num((m['coord'] as unknown[])[0]) !== null) {
        markers.push({ seriesIndex, atIndex: num((m['coord'] as unknown[])[0]) as number, label: name })
      } else {
        warn('mark-shape-unsupported', `${path}.markPoint.data[${k}]`, 'Only max/min and coord markPoints are mapped.')
      }
    }
  }

  // ---- title / legend / tooltip ----------------------------------------
  const titleRaw = first(option['title'] as Record<string, unknown> | Record<string, unknown>[] | undefined)
  const title =
    isObj(titleRaw) && typeof titleRaw['text'] === 'string'
      ? { text: titleRaw['text'] as string, subtext: typeof titleRaw['subtext'] === 'string' ? (titleRaw['subtext'] as string) : undefined }
      : null
  const legendRaw = option['legend']
  const legend =
    legendRaw === undefined || (isObj(legendRaw) && legendRaw['show'] === false)
      ? null
      : series.map((s) => ({ label: s.label, color: s.color }))
  const tooltipRaw = option['tooltip']
  const tooltip = tooltipRaw !== undefined && !(isObj(tooltipRaw) && tooltipRaw['show'] === false)

  const spec: ChartSpec = {
    width: opts.width ?? 640.0,
    height: opts.height ?? 320.0,
    series,
    categories,
    theme: defaultTheme,
    showXAxis: true,
    showYAxis: true,
    showGrid: true,
    yDomain,
    y2Domain,
    yFormat,
    y2Format,
    xFormat,
    xValues,
    xTime: xTime ? true : undefined,
    annotations: annotations.length > 0 ? annotations : undefined,
    markers: markers.length > 0 ? markers : undefined,
  }
  return { spec, title, legend, tooltip, warnings, supported }
}

const defaultPalette = ['#0f766e', '#b45309', '#1d4ed8', '#b42318', '#15803d', '#7c3aed']

function axisDomain(axis: Record<string, unknown> | undefined): Domain | undefined {
  if (axis === undefined) return undefined
  const lo = num(axis['min'])
  const hi = num(axis['max'])
  if (lo === null || hi === null) return undefined
  return { min: lo, max: hi }
}

function axisFormatter(
  axis: Record<string, unknown> | undefined,
  path: string,
  warn: (code: OptionWarning['code'], path: string, message: string) => void,
): Formatter | undefined {
  if (!isObj(axis) || !isObj(axis['axisLabel'])) return undefined
  const f = axis['axisLabel']['formatter']
  if (typeof f === 'function') return f as Formatter
  if (typeof f === 'string') {
    // The `{value}` template is the common case and maps exactly.
    const tpl = f
    if (tpl.includes('{value}')) return (v: Double): string => tpl.replace('{value}', String(v))
    warn('axis-formatter-template', `${path}.axisLabel.formatter`, 'Only function formatters and the {value} template are supported.')
  }
  return undefined
}

function shift(c: DrawCmd, dy: Double): DrawCmd {
  switch (c.kind) {
    case 'rect':
      return { ...c, rect: { ...c.rect, y: c.rect.y + dy } }
    case 'line':
      return { ...c, from: { ...c.from, y: c.from.y + dy }, to: { ...c.to, y: c.to.y + dy } }
    case 'polyline':
    case 'polygon':
      return { ...c, points: c.points.map((p) => ({ ...p, y: p.y + dy })) }
    case 'circle':
      return { ...c, center: { ...c.center, y: c.center.y + dy } }
    default:
      return { ...c, at: { ...c.at, y: c.at.y + dy } }
  }
}

export interface OptionToSvgOptions extends CompileOptions {
  measure?: MeasureText
}

/**
 * ECharts option → `<svg>` string, server-safe. The chart, its title and its
 * legend are composed the way the host component composes them: title on
 * top, legend under it, the plot shrunk by exactly what those consumed.
 */
export function optionToSvg(option: EChartsOption, opts: OptionToSvgOptions = {}): string {
  const compiled = compileOption(option, opts)
  const measure = opts.measure ?? measureApprox()
  const width = compiled.spec.width
  const height = compiled.spec.height
  const t = compiled.spec.theme
  let top = 0.0
  const cmds: DrawCmd[] = []
  if (compiled.title !== null) {
    cmds.push({ kind: 'text', text: compiled.title.text, at: { x: 0.0, y: 0.0 }, fill: t.label, size: t.fontSize + 4.0, align: 'start', baseline: 'top' })
    top = top + t.fontSize + 4.0
    if (compiled.title.subtext !== undefined) {
      cmds.push({ kind: 'text', text: compiled.title.subtext, at: { x: 0.0, y: top + 2.0 }, fill: t.label, size: t.fontSize, align: 'start', baseline: 'top' })
      top = top + t.fontSize + 2.0
    }
    top = top + 8.0
  }
  if (compiled.legend !== null && compiled.legend.length > 0) {
    const l = renderLegend(compiled.legend, { x: 0.0, y: top, w: width, h: height - top }, { fontSize: t.fontSize, labelColor: t.label, swatch: 10.0, gap: 12.0, orientation: 'horizontal' }, measure)
    for (const c of l.cmds) cmds.push(c)
    top = top + l.height
  }
  const chart = renderChart({ ...compiled.spec, height: Math.max(0.0, height - top) }, measure)
  for (const c of chart) cmds.push(top === 0.0 ? c : shift(c, top))
  return renderSvg(cmds, width, height, {
    ...(compiled.title !== null ? { title: compiled.title.text } : {}),
  })
}
