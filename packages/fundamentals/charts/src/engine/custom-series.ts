// Custom series — ECharts' `renderItem` over the graphic-element vocabulary.
//
// A custom series does not add a Series to the spec; it renders AFTER the
// chart through the same graphic lowering the `graphic` option uses, with an
// `api` that maps data to pixels through the chart's own layout.

import { graphicCommands } from './option-layer'
import type { OptionWarning } from './option'
import { layoutChart, resolveYDomain } from './render'
import type { ChartSpec } from './render'
import type { Double, DrawCmd, MeasureText, Rect } from './types'

export interface CustomRenderParams {
  seriesIndex: number
  dataIndex: number
  dataInsideLength: number
  /** The plot rectangle in pixels. */
  coordSys: { type: 'cartesian2d'; x: Double; y: Double; width: Double; height: Double }
}

export interface CustomRenderApi {
  /** A datum's dimension, or the datum itself when it is a scalar. */
  value: (dim?: number, dataIndex?: number) => unknown
  /** Data-space `[x, y]` → pixel `[x, y]`. */
  coord: (point: [unknown, unknown]) => [Double, Double]
  /** Data-space `[w, h]` extents → pixel `[w, h]`. */
  size: (extent: [Double, Double], base?: [unknown, unknown]) => [Double, Double]
  /** Default item style merged with `extra`. */
  style: (extra?: Record<string, unknown>) => Record<string, unknown>
  visual: (key: string) => unknown
}

export type CustomRenderItem = (params: CustomRenderParams, api: CustomRenderApi) => unknown

export interface CustomSeriesPlan {
  name: string
  color: string
  data: unknown[]
  renderItem: CustomRenderItem
  /** Dimension indices of the y channel(s), for the axis extent. */
  yDims: number[]
  xDim: number
}

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function dimOf(datum: unknown, dim: number): unknown {
  if (Array.isArray(datum)) return datum[dim]
  if (typeof datum === 'object' && datum !== null && !Array.isArray(datum)) {
    const v = (datum as Record<string, unknown>)['value']
    return Array.isArray(v) ? v[dim] : dim === 0 ? v : undefined
  }
  return dim === 0 ? datum : undefined
}

/** Value extents a custom series contributes to the axes (null when no numbers). */
export function customExtents(plan: CustomSeriesPlan): { x: [Double, Double] | null; y: [Double, Double] | null } {
  let xlo = Infinity
  let xhi = -Infinity
  let ylo = Infinity
  let yhi = -Infinity
  // A lines datum is a flattened [x, y, x, y, …] row: every even dim is an x.
  const allPairs = plan.yDims.length > 1 && plan.yDims.every((d, k) => d === 2 * k + 1)
  for (const d of plan.data) {
    const xDims = allPairs && Array.isArray(d) ? d.map((_, k) => k).filter((k) => k % 2 === 0) : [plan.xDim]
    for (const xd of xDims) {
      const x = num(dimOf(d, xd))
      if (x === null) continue
      if (x < xlo) xlo = x
      if (x > xhi) xhi = x
    }
    for (const yd of plan.yDims) {
      const y = num(dimOf(d, yd))
      if (y === null) continue
      if (y < ylo) ylo = y
      if (y > yhi) yhi = y
    }
  }
  return { x: xlo === Infinity ? null : [xlo, xhi], y: ylo === Infinity ? null : [ylo, yhi] }
}

/** Draw commands for every custom series, in chart pixel space (shift for a title/legend offset yourself). */
export function customCommands(plans: CustomSeriesPlan[], spec: ChartSpec, measure: MeasureText, width: Double, height: Double): { cmds: DrawCmd[]; warnings: OptionWarning[] } {
  const cmds: DrawCmd[] = []
  const warnings: OptionWarning[] = []
  if (plans.length === 0) return { cmds, warnings }
  const layout = layoutChart(spec, measure)
  const plot: Rect = layout.plot
  const yDom = resolveYDomain(spec)
  const xDom = layout.xDomainUsed
  const xSpan = xDom.max - xDom.min
  const ySpan = yDom.max - yDom.min
  const categories = spec.categories
  const px = (x: unknown): Double => {
    let v = num(x)
    if (v === null && typeof x === 'string') {
      const i = categories.indexOf(x)
      v = i >= 0 ? i : 0.0
    }
    if (v === null) v = 0.0
    return xSpan <= 0.0 ? plot.x + plot.w / 2.0 : plot.x + ((v - xDom.min) / xSpan) * plot.w
  }
  const py = (y: unknown): Double => {
    const v = num(y) ?? 0.0
    return ySpan <= 0.0 ? plot.y + plot.h / 2.0 : plot.y + plot.h - ((v - yDom.min) / ySpan) * plot.h
  }
  for (let si = 0; si < plans.length; si++) {
    const plan = plans[si]!
    const api: CustomRenderApi = {
      value: (dim = 0, dataIndex = 0) => dimOf(plan.data[dataIndex], dim),
      coord: (point) => [px(point[0]), py(point[1])],
      size: (extent) => [xSpan <= 0.0 ? 0.0 : (extent[0] / xSpan) * plot.w, ySpan <= 0.0 ? 0.0 : (extent[1] / ySpan) * plot.h],
      style: (extra = {}) => ({ fill: plan.color, ...extra }),
      visual: (key) => (key === 'color' ? plan.color : undefined),
    }
    for (let i = 0; i < plan.data.length; i++) {
      const params: CustomRenderParams = { seriesIndex: si, dataIndex: i, dataInsideLength: plan.data.length, coordSys: { type: 'cartesian2d', x: plot.x, y: plot.y, width: plot.w, height: plot.h } }
      const valueApi: CustomRenderApi = { ...api, value: (dim = 0, dataIndex = i) => dimOf(plan.data[dataIndex], dim) }
      let el: unknown
      try {
        el = plan.renderItem(params, valueApi)
      } catch (err) {
        warnings.push({ code: 'series-data-shape', path: `series[${si}].renderItem`, message: `renderItem threw for datum ${i}: ${err instanceof Error ? err.message : String(err)}; the datum was skipped.` })
        continue
      }
      if (el === null || el === undefined) continue
      const lowered = graphicCommands({ graphic: [el] }, width, height)
      for (const w of lowered.warnings) warnings.push({ ...w, path: `series[${si}].renderItem` })
      for (const c of lowered.cmds) cmds.push(c)
    }
  }
  return { cmds, warnings }
}
