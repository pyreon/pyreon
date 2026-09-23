/**
 * ECharts' pie keys read into the engine's pie configs: how the slices go
 * round (`startAngle`, `clockwise`, `minAngle`, `padAngle`, `roseType`,
 * `stillShowZeroSum`) and how they are labelled (`label`, `labelLine`,
 * `avoidLabelOverlap`, `percentPrecision`).
 */
import type { ArcConfig } from './arc'
import { percentSeats } from './host-item'
import { PIE_LABEL_DEFAULTS } from './pie-labels'
import type { PieLabelOptions } from './pie-labels'
import { formatTooltipTemplate } from './tooltip-format'
import type { Double } from './types'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const RADIAN = Math.PI / 180.0
/** A length or a percent of `whole`. */
const pctOf = (v: unknown, whole: Double): Double => (typeof v === 'number' ? v : typeof v === 'string' && v.endsWith('%') ? (Number.parseFloat(v) / 100.0) * whole : typeof v === 'string' ? Number.parseFloat(v) || 0.0 : 0.0)

/** What the engine needs to draw a pie as ECharts does. */
export interface PieShape {
  arcs: ArcConfig
  /** Undefined when the series turns its labels off. */
  labels: PieLabelOptions | undefined
  /** The empty circle's colour with no data; '' for none (ECharts' `showEmptyCircle` / `emptyCircleStyle`). */
  empty: string
}

/** ECharts' empty circle: lightgray unless the series styles it or turns it off. */
export function readPieEmpty(s: Obj): string {
  if (s['showEmptyCircle'] === false) return ''
  const style = isObj(s['emptyCircleStyle']) ? s['emptyCircleStyle'] : {}
  return typeof style['color'] === 'string' ? (style['color'] as string) : 'lightgray'
}

/** A slice as the label formatter sees it. */
export interface PieRow {
  value: Double
  name: string
  color: string | undefined
}

/**
 * How much of the turn runs from `start` to `end` in the pie's direction —
 * zrender's `normalizeArcAngles`, which ECharts runs over the two angles.
 */
export function arcSweep(start: Double, end: Double, clockwise: boolean): Double {
  const TAU = Math.PI * 2.0
  let s0 = start % TAU
  if (s0 < 0) s0 += TAU
  let e = end + (s0 - start)
  if (clockwise && e - s0 >= TAU) e = s0 + TAU
  else if (!clockwise && s0 - e >= TAU) e = s0 - TAU
  else if (clockwise && s0 > e) e = s0 + (TAU - ((s0 - e) % TAU))
  else if (!clockwise && s0 < e) e = s0 - (TAU - ((e - s0) % TAU))
  return Math.abs(e - s0)
}

/** The arc layout a pie series asks for. */
export function readPieArcs(s: Obj): ArcConfig {
  const rose = s['roseType']
  // ECharts: degrees counter-clockwise from 3 o'clock; the canvas turns the other way.
  const start = -(num(s['startAngle']) ?? 90.0) * RADIAN
  const clockwise = s['clockwise'] !== false
  const endDeg = num(s['endAngle'])
  return {
    start,
    // 'auto' (the default) is a whole turn.
    sweep: arcSweep(start, endDeg === undefined ? start - Math.PI * 2.0 : -endDeg * RADIAN, clockwise),
    clockwise,
    minAngle: Math.max(0.0, num(s['minAngle']) ?? 0.0) * RADIAN,
    padAngle: Math.max(0.0, num(s['padAngle']) ?? 0.0) * RADIAN,
    rose: rose === 'area' ? 'area' : rose === 'radius' || rose === true ? 'radius' : '',
    zeros: s['stillShowZeroSum'] !== false,
  }
}

/** A label formatter's params for one slice, as ECharts passes them. */
function params(s: Obj, row: PieRow, index: number, percent: Double, datum: unknown): Obj {
  return {
    componentType: 'series',
    componentSubType: 'pie',
    seriesType: 'pie',
    seriesIndex: 0,
    seriesName: typeof s['name'] === 'string' ? s['name'] : '',
    name: row.name,
    dataIndex: index,
    data: datum,
    value: row.value,
    percent,
    color: row.color,
    status: 'normal',
  }
}

/**
 * The label options a pie series asks for, with one text per row. `rawData`
 * is the series' own `data`, index-aligned with `rows`, for a function
 * formatter's `params.data`.
 */
export function readPieLabels(s: Obj, rows: PieRow[], rawData: unknown[]): PieLabelOptions | undefined {
  const label = isObj(s['label']) ? s['label'] : {}
  const rot = label['rotate']
  const ed = label['edgeDistance'] ?? '25%'
  // A percent of the view's width, resolved when the view is known.
  const edgePct = typeof ed === 'string' && ed.endsWith('%') ? Number.parseFloat(ed) / 100.0 : null
  if (label['show'] === false) return undefined
  const line = isObj(s['labelLine']) ? s['labelLine'] : {}
  const lineStyle = isObj(line['lineStyle']) ? line['lineStyle'] : {}
  const precision = Math.max(0, Math.min(20, Math.round(num(s['percentPrecision']) ?? 2)))
  const seats = percentSeats(rows.map((r) => r.value), precision)
  const f = label['formatter']
  const seriesName = typeof s['name'] === 'string' ? s['name'] : ''
  const texts = rows.map((r, i) => {
    const percent = seats[i] ?? 0
    if (typeof f === 'function') {
      const out = (f as (p: Obj) => unknown)(params(s, r, i, percent, rawData[i]))
      return out === undefined || out === null ? '' : String(out)
    }
    const tpl = typeof f === 'string' ? f : '{b}'
    return formatTooltipTemplate(tpl, [{ seriesName, name: r.name, value: String(r.value), percent: String(percent), values: [], color: r.color ?? '' }])
  })
  const pos = label['position']
  const position = pos === 'inside' || pos === 'inner' ? 'inside' : pos === 'center' ? 'center' : 'outside'
  return {
    ...PIE_LABEL_DEFAULTS,
    position,
    texts,
    fontSize: num(label['fontSize']) ?? PIE_LABEL_DEFAULTS.fontSize,
    color: typeof label['color'] === 'string' ? (label['color'] as string) : '',
    line: line['show'] !== false,
    lineColor: typeof lineStyle['color'] === 'string' ? (lineStyle['color'] as string) : '',
    leg1: num(line['length']) ?? PIE_LABEL_DEFAULTS.leg1,
    leg2: num(line['length2']) ?? PIE_LABEL_DEFAULTS.leg2,
    distance: num(label['distanceToLabelLine']) ?? PIE_LABEL_DEFAULTS.distance,
    avoidOverlap: s['avoidLabelOverlap'] !== false,
    minTurnAngle: num(line['minTurnAngle']) ?? PIE_LABEL_DEFAULTS.minTurnAngle,
    maxSurfaceAngle: num(line['maxSurfaceAngle']) ?? PIE_LABEL_DEFAULTS.maxSurfaceAngle,
    minAngle: Math.max(0.0, num(s['minShowLabelAngle']) ?? 0.0) * RADIAN,
    // 'break' / 'breakAll' wrap in ECharts; a label here is one line, so they cut as 'truncate' does.
    overflow: label['overflow'] === 'none' ? 'none' : 'truncate',
    bleedMargin: num(label['bleedMargin']) ?? -1.0,
    alignTo: label['alignTo'] === 'edge' || label['alignTo'] === 'labelLine' ? (label['alignTo'] as string) : 'none',
    edgeDistance: edgePct === null ? pctOf(label['edgeDistance'], 0.0) : 0.0,
    edgePercent: edgePct ?? -1.0,
    rotate: typeof rot === 'number' ? 'fixed' : rot === true ? 'radial' : rot === 'radial' || rot === 'tangential' || rot === 'tangential-noflip' ? rot : '',
    rotateDegrees: typeof rot === 'number' ? rot : 0.0,
  }
}

/** The pie keys this module reads, for the family's known-key set. */
export const PIE_SHAPE_KEYS = ['startAngle', 'endAngle', 'showEmptyCircle', 'emptyCircleStyle', 'minShowLabelAngle', 'left', 'top', 'right', 'bottom', 'width', 'height', 'clockwise', 'minAngle', 'padAngle', 'roseType', 'stillShowZeroSum', 'labelLine', 'avoidLabelOverlap', 'percentPrecision'] as const
