// visualMap — the value → colour legend strip (continuous ramp or piecewise swatches).

import { HEAT_RAMP } from './heat'
import { colorRamp } from './heat-ramp'
import type { OptionWarning } from './option'
import type { Double, DrawCmd, Rect } from './types'
import { renderVisualStrip, visualOutBands, visualStripSize } from './visual-strip'
import type { VisualStrip } from './visual-strip'

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export interface VisualMapPiece {
  label: string
  color: string
  min?: Double | undefined
  max?: Double | undefined
}

export interface VisualMapSpec {
  type: 'continuous' | 'piecewise'
  stops: string[]
  domain: [Double, Double]
  pieces: VisualMapPiece[]
  orient: 'horizontal' | 'vertical'
  /** [high, low] end labels for the continuous strip. */
  text: [string, string] | undefined
  fontSize: Double
  labelColor: string
  /** Bar thickness / swatch size in pixels. */
  itemSize: Double
  /** Bar length for the continuous strip. */
  itemLength: Double
  /** Continuous: draggable range handles (`calculable`). */
  calculable: boolean
  /** The selected range (`visualMap.range`), default the domain. */
  range: [Double, Double]
  /** Piecewise: per-piece selection (`visualMap.selected`, by piece index); default all on. */
  selected: boolean[]
  /** ECharts' `inactiveColor`: out-of-selection values and swatches. */
  inactiveColor: string
}

/** Layout of the strip within `box`; the strip is anchored at the box origin. */
export interface VisualMapLayout {
  cmds: DrawCmd[]
  width: Double
  height: Double
}

/** The spec as the engine's strip — the one geometry every target draws and hit-tests. */
export function visualStripOf(spec: VisualMapSpec): VisualStrip {
  return {
    piecewise: spec.type === 'piecewise',
    stops: spec.stops,
    domain: { min: spec.domain[0], max: spec.domain[1] },
    pieces: spec.pieces,
    vertical: spec.orient === 'vertical',
    highText: spec.text?.[0] ?? '',
    lowText: spec.text?.[1] ?? '',
    fontSize: spec.fontSize,
    labelColor: spec.labelColor,
    itemSize: spec.itemSize,
    itemLength: spec.itemLength,
    calculable: spec.calculable,
    outColor: spec.inactiveColor,
  }
}

/** The selection as renderer options (`inRange` / `outBands` / `outColor`), or empty when nothing is excluded. */
export function visualSelectionOptions(spec: VisualMapSpec): { inRange?: { min: Double; max: Double }; outBands?: Double[]; outColor?: string } {
  if (spec.type === 'piecewise') {
    const bands = visualOutBands(visualStripOf(spec), spec.selected)
    return bands.length === 0 ? {} : { outBands: bands, outColor: spec.inactiveColor }
  }
  const [lo, hi] = spec.range
  if (lo <= spec.domain[0] && hi >= spec.domain[1]) return {}
  return { inRange: { min: lo, max: hi }, outColor: spec.inactiveColor }
}

/** Render the strip with its top-left at `at`. */
export function renderVisualMap(spec: VisualMapSpec, at: { x: Double; y: Double }): VisualMapLayout {
  const strip = visualStripOf(spec)
  const size = visualStripSize(strip)
  return { cmds: renderVisualStrip(strip, at, { min: spec.range[0], max: spec.range[1] }, spec.selected), width: size.x, height: size.y }
}

/** Numeric extent of the first series' values — the domain when `visualMap` has no min/max. */
export function domainFromSeries(option: Record<string, unknown>): [Double, Double] | null {
  const sRaw = option['series']
  const s = Array.isArray(sRaw) ? sRaw[0] : sRaw
  if (!isObj(s) || !Array.isArray(s['data'])) return null
  let lo = Infinity
  let hi = -Infinity
  for (const d of s['data'] as unknown[]) {
    let v: number | null = null
    if (Array.isArray(d)) v = num(d[d.length - 1])
    else if (isObj(d)) v = Array.isArray(d['value']) ? num((d['value'] as unknown[])[(d['value'] as unknown[]).length - 1]) : num(d['value'])
    else v = num(d)
    if (v === null) continue
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  return lo === Infinity ? null : [lo, hi]
}

/** Read `option.visualMap` (first entry) into a spec, or null when hidden/absent. */
export function visualMapSpec(option: Record<string, unknown>): { spec: VisualMapSpec; place: { left?: unknown; right?: unknown; top?: unknown; bottom?: unknown }; warnings: OptionWarning[] } | null {
  const raw = option['visualMap']
  const vm = Array.isArray(raw) ? raw[0] : raw
  if (!isObj(vm) || vm['show'] === false) return null
  const warnings: OptionWarning[] = []
  const inRange = isObj(vm['inRange']) ? vm['inRange'] : {}
  const stopsRaw = Array.isArray(inRange['color']) ? (inRange['color'] as unknown[]).filter((c): c is string => typeof c === 'string') : []
  const stops = stopsRaw.length >= 2 ? stopsRaw : HEAT_RAMP
  const vmin = num(vm['min'])
  const vmax = num(vm['max'])
  const data = domainFromSeries(option)
  const domain: [Double, Double] = [vmin ?? data?.[0] ?? 0.0, vmax ?? data?.[1] ?? 1.0]
  const fontSize = num(isObj(vm['textStyle']) ? vm['textStyle']['fontSize'] : undefined) ?? 11.0
  const type = vm['type'] === 'piecewise' ? 'piecewise' : 'continuous'
  const orient = vm['orient'] === 'horizontal' ? 'horizontal' : 'vertical'
  const ramp = colorRamp(stops)
  const pieces: VisualMapPiece[] = []
  if (type === 'piecewise') {
    if (Array.isArray(vm['pieces'])) {
      const ps = vm['pieces'] as unknown[]
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i]
        if (!isObj(p)) continue
        const lo = num(p['min']) ?? num(p['gte']) ?? num(p['gt'])
        const hi = num(p['max']) ?? num(p['lte']) ?? num(p['lt'])
        const label = typeof p['label'] === 'string' ? (p['label'] as string) : lo !== null && hi !== null ? `${lo} – ${hi}` : lo !== null ? `≥ ${lo}` : hi !== null ? `≤ ${hi}` : String(i + 1)
        const t = ps.length <= 1 ? 1.0 : 1.0 - i / (ps.length - 1)
        pieces.push({ label, color: typeof p['color'] === 'string' ? (p['color'] as string) : ramp(t), ...(lo !== null ? { min: lo } : {}), ...(hi !== null ? { max: hi } : {}) })
      }
    } else if (Array.isArray(vm['categories'])) {
      const cats = vm['categories'] as unknown[]
      cats.forEach((c, i) => pieces.push({ label: String(c), color: ramp(cats.length <= 1 ? 1.0 : i / (cats.length - 1)) }))
    } else {
      const n = Math.max(1, Math.floor(num(vm['splitNumber']) ?? 5))
      const step = (domain[1] - domain[0]) / n
      for (let i = n - 1; i >= 0; i--) {
        const lo = domain[0] + step * i
        const hi = lo + step
        pieces.push({ label: `${round2(lo)} – ${round2(hi)}`, color: ramp(n <= 1 ? 1.0 : i / (n - 1)), min: lo, max: hi })
      }
    }
  }
  const rangeRaw = vm['range']
  const r0 = Array.isArray(rangeRaw) ? num(rangeRaw[0]) : null
  const r1 = Array.isArray(rangeRaw) ? num(rangeRaw[1]) : null
  const range: [Double, Double] = r0 !== null && r1 !== null ? [Math.min(r0, r1), Math.max(r0, r1)] : [domain[0], domain[1]]
  // ECharts keys `selected` by piece label (or category); an index key also works here.
  const selRaw = isObj(vm['selected']) ? vm['selected'] : {}
  const selected = pieces.map((p, i) => selRaw[p.label] !== false && selRaw[String(i)] !== false)
  const textRaw = vm['text']
  const text: [string, string] | undefined = Array.isArray(textRaw) && textRaw.length === 2 ? [String(textRaw[0]), String(textRaw[1])] : undefined
  const spec: VisualMapSpec = {
    type,
    stops,
    domain,
    pieces,
    orient,
    text,
    fontSize,
    labelColor: '#64748b',
    itemSize: num(vm['itemWidth']) ?? (type === 'piecewise' ? 14.0 : 16.0),
    itemLength: num(vm['itemHeight']) ?? 120.0,
    calculable: type === 'continuous' && vm['calculable'] === true,
    range,
    selected,
    inactiveColor: typeof vm['inactiveColor'] === 'string' ? (vm['inactiveColor'] as string) : '#cccccc',
  }
  return { spec, place: { left: vm['left'], right: vm['right'], top: vm['top'], bottom: vm['bottom'] }, warnings }
}

function round2(v: Double): string {
  return String(Math.round(v * 100.0) / 100.0)
}

function placeEdge(v: unknown, size: Double, extent: Double): Double | null {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    if (v === 'center' || v === 'middle') return (size - extent) / 2.0
    if (v === 'left' || v === 'top') return 0.0
    if (v === 'right' || v === 'bottom') return size - extent
    if (v.endsWith('%')) {
      const n = Number(v.slice(0, -1))
      return Number.isFinite(n) ? (size * n) / 100.0 : null
    }
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** The strip as draw commands for a `width × height` canvas — ECharts' default corner is bottom-left. */
export function visualMapCommands(option: Record<string, unknown>, width: Double, height: Double): { cmds: DrawCmd[]; warnings: OptionWarning[]; box: Rect | null } {
  const read = visualMapSpec(option)
  if (read === null) return { cmds: [], warnings: [], box: null }
  const probe = renderVisualMap(read.spec, { x: 0.0, y: 0.0 })
  const margin = 8.0
  let x = placeEdge(read.place.left, width, probe.width)
  if (x === null) {
    const r = placeEdge(read.place.right, width, probe.width)
    x = r === null ? margin : width - r - probe.width
  }
  let y = placeEdge(read.place.top, height, probe.height)
  if (y === null) {
    const b = placeEdge(read.place.bottom, height, probe.height)
    y = b === null ? height - margin - probe.height : height - b - probe.height
  }
  const laid = renderVisualMap(read.spec, { x, y })
  return { cmds: laid.cmds, warnings: read.warnings, box: { x, y, w: laid.width, h: laid.height } }
}
