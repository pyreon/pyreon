// visualMap — the value → colour legend strip (continuous ramp or piecewise swatches).

import { HEAT_RAMP } from './heat'
import { colorRamp } from './heat-ramp'
import type { OptionWarning } from './option'
import type { Double, DrawCmd, Rect } from './types'

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
}

/** Layout of the strip within `box`; the strip is anchored at the box origin. */
export interface VisualMapLayout {
  cmds: DrawCmd[]
  width: Double
  height: Double
}

const STRIPES = 24

/** Render the strip with its top-left at `at`. */
export function renderVisualMap(spec: VisualMapSpec, at: { x: Double; y: Double }): VisualMapLayout {
  const cmds: DrawCmd[] = []
  const fs = spec.fontSize
  const gap = 4.0
  const labelW = fs * 3.2
  if (spec.type === 'piecewise') {
    const rows = spec.pieces
    if (spec.orient === 'vertical') {
      let y = at.y
      let widest = 0.0
      for (const p of rows) {
        cmds.push({ kind: 'rect', rect: { x: at.x, y, w: spec.itemSize, h: spec.itemSize }, fill: p.color })
        cmds.push({ kind: 'text', text: p.label, at: { x: at.x + spec.itemSize + gap, y: y + spec.itemSize / 2.0 }, fill: spec.labelColor, size: fs, align: 'start', baseline: 'middle' })
        if (p.label.length * fs * 0.55 > widest) widest = p.label.length * fs * 0.55
        y = y + spec.itemSize + gap
      }
      return { cmds, width: spec.itemSize + gap + widest, height: Math.max(0.0, y - at.y - gap) }
    }
    let x = at.x
    for (const p of rows) {
      cmds.push({ kind: 'rect', rect: { x, y: at.y, w: spec.itemSize, h: spec.itemSize }, fill: p.color })
      const tw = p.label.length * fs * 0.55
      cmds.push({ kind: 'text', text: p.label, at: { x: x + spec.itemSize + gap, y: at.y + spec.itemSize / 2.0 }, fill: spec.labelColor, size: fs, align: 'start', baseline: 'middle' })
      x = x + spec.itemSize + gap + tw + gap * 2.0
    }
    return { cmds, width: Math.max(0.0, x - at.x - gap * 2.0), height: spec.itemSize }
  }
  const ramp = colorRamp(spec.stops)
  const [lo, hi] = spec.domain
  const high = spec.text?.[0] ?? String(hi)
  const low = spec.text?.[1] ?? String(lo)
  if (spec.orient === 'vertical') {
    // High at the top: the strip reads like a thermometer.
    const y0 = at.y + fs + gap
    for (let i = 0; i < STRIPES; i++) {
      const t = 1.0 - (i + 0.5) / STRIPES
      cmds.push({ kind: 'rect', rect: { x: at.x, y: y0 + (spec.itemLength * i) / STRIPES, w: spec.itemSize, h: spec.itemLength / STRIPES + 0.5 }, fill: ramp(t) })
    }
    cmds.push({ kind: 'text', text: high, at: { x: at.x + spec.itemSize / 2.0, y: at.y }, fill: spec.labelColor, size: fs, align: 'middle', baseline: 'top' })
    cmds.push({ kind: 'text', text: low, at: { x: at.x + spec.itemSize / 2.0, y: y0 + spec.itemLength + gap }, fill: spec.labelColor, size: fs, align: 'middle', baseline: 'top' })
    return { cmds, width: Math.max(spec.itemSize, labelW), height: fs * 2.0 + gap * 2.0 + spec.itemLength }
  }
  const x0 = at.x + labelW + gap
  for (let i = 0; i < STRIPES; i++) {
    const t = (i + 0.5) / STRIPES
    cmds.push({ kind: 'rect', rect: { x: x0 + (spec.itemLength * i) / STRIPES, y: at.y, w: spec.itemLength / STRIPES + 0.5, h: spec.itemSize }, fill: ramp(t) })
  }
  cmds.push({ kind: 'text', text: low, at: { x: x0 - gap, y: at.y + spec.itemSize / 2.0 }, fill: spec.labelColor, size: fs, align: 'end', baseline: 'middle' })
  cmds.push({ kind: 'text', text: high, at: { x: x0 + spec.itemLength + gap, y: at.y + spec.itemSize / 2.0 }, fill: spec.labelColor, size: fs, align: 'start', baseline: 'middle' })
  return { cmds, width: labelW + gap + spec.itemLength + gap + labelW, height: spec.itemSize }
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
  if (vm['calculable'] === true) warnings.push({ code: 'series-option-unsupported', path: 'visualMap.calculable', message: 'A draggable visualMap handle is not supported; the strip is static.' })
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
