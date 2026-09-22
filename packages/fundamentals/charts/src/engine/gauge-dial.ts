// ECharts' gauge, drawn as its `GaugeView` draws it: the axis line in colour
// bands, split lines, ticks and labels round the dial, a progress arc and a
// pointer per value, an anchor, and each value's title and detail text.
//
// Lengths ECharts allows as a percent of the radius (a split line's length, a
// pointer's, the title's offset) travel as `DialLen` and resolve against the
// radius at draw time, when it is known.

import { arcPolygon } from './arc'
import { symbolPoints } from './pictorial'
import type { DrawCmd, Double, Pt, Rect } from './types'

/** A length in pixels, or a fraction of the dial's radius. */
export type DialLen = { v: Double; pct: boolean }

/** Where the axis line changes colour: up to `at` (0..1 of the dial) it is `color`. */
export type DialStop = { at: Double; color: string }

/** One value on the dial. */
export type DialDatum = {
  value: Double
  /** The title under the centre — the datum's name. */
  name: string
  /** The detail text, already formatted. */
  detail: string
  /** The datum's own colour (the palette's, or its itemStyle). */
  color: string
  /** Pointer and progress colour overrides; '' takes `color`, 'auto' the axis band's. */
  pointerColor: string
  progressColor: string
  titleX: DialLen
  titleY: DialLen
  detailX: DialLen
  detailY: DialLen
}

export type DialSpec = {
  /** Canvas radians; the dial runs `sweep` from `start` in the given direction. */
  start: Double
  sweep: Double
  clockwise: boolean
  min: Double
  max: Double
  splitNumber: number
  lineShow: boolean
  lineWidth: Double
  stops: DialStop[]
  /** Round the axis line's ends (zrender's sausage). */
  lineRound: boolean
  progressShow: boolean
  progressRound: boolean
  progressOverlap: boolean
  progressWidth: Double
  progressClip: boolean
  splitShow: boolean
  splitLength: DialLen
  splitDistance: Double
  splitColor: string
  splitWidth: Double
  tickShow: boolean
  tickSplit: number
  tickLength: DialLen
  tickDistance: Double
  tickColor: string
  tickWidth: Double
  labelShow: boolean
  labelDistance: Double
  /** '' takes the axis band's colour (ECharts' 'auto'). */
  labelColor: string
  labelSize: Double
  /** One per split point, already formatted. */
  labels: string[]
  /** '', 'radial', 'tangential', or 'fixed' with `labelDegrees`. */
  labelRotate: string
  labelDegrees: Double
  pointerShow: boolean
  pointerAbove: boolean
  pointerLength: DialLen
  pointerWidth: DialLen
  pointerX: DialLen
  pointerY: DialLen
  /** '' for ECharts' needle; else a symbol (rect / roundRect / circle / diamond / triangle / arrow) filling the pointer's box. */
  pointerIcon: string
  anchorShow: boolean
  /** The anchor's symbol — 'circle' by default. */
  anchorIcon: string
  anchorAbove: boolean
  anchorSize: Double
  anchorColor: string
  anchorBorder: string
  anchorBorderWidth: Double
  anchorX: DialLen
  anchorY: DialLen
  titleShow: boolean
  titleColor: string
  titleSize: Double
  detailShow: boolean
  /** '' takes the datum's colour when progress shows, else the axis band's. */
  detailColor: string
  detailSize: Double
  detailBold: boolean
  /** The detail's box: fill ('' for none), border, and its content size and padding (ECharts' 100 wide, a line high, 5/10 padding). */
  detailBg: string
  detailBorder: string
  detailBorderWidth: Double
  detailWidth: Double
  /** Below 0: one line of the detail's font. */
  detailHeight: Double
  detailPadding: Double[]
  data: DialDatum[]
}

/** A length resolved against the radius. */
export function dialLen(l: DialLen, r: Double): Double {
  return l.pct ? l.v * r : l.v
}

/** The axis band colour at `t` (0..1 along the dial) — ECharts' `getColor`. */
export function dialColor(stops: DialStop[], t: Double): string {
  if (stops.length === 0) return '#000'
  if (t <= 0.0) return stops[0]!.color
  for (let i = 0; i < stops.length; i++) {
    const lo = i === 0 ? 0.0 : stops[i - 1]!.at
    if (stops[i]!.at >= t && lo < t) return stops[i]!.color
  }
  return stops[stops.length - 1]!.color
}

/** A value's place along the dial, 0..1, clamped. */
function fraction(v: Double, lo: Double, hi: Double): Double {
  if (hi === lo) return 0.0
  return Math.max(0.0, Math.min(1.0, (v - lo) / (hi - lo)))
}

/** A draw command with its paint order: ECharts' z2, then the order it was added. */
type Layered = { z: Double; seq: Double; cmd: DrawCmd }

/** A polygon ring (or pie wedge) between two canvas angles, whichever way they run; `round` caps its ends. */
function band(center: Pt, outer: Double, inner: Double, a: Double, b: Double, fill: string, round: boolean): DrawCmd {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  if (round && hi - lo < Math.PI * 2.0) return { kind: 'polygon', points: sausagePolygon(center, outer, inner, lo, hi), fill }
  return { kind: 'polygon', points: arcPolygon(center, outer, inner, lo, hi), fill }
}

/**
 * zrender's sausage: a ring band from `lo` to `hi` with a half circle on each
 * end, centred on the band's middle radius — so the round end reaches past
 * the angle by half the band's width, as ECharts' round-capped gauge does.
 */
export function sausagePolygon(center: Pt, outer: Double, inner: Double, lo: Double, hi: Double): Pt[] {
  const r0 = Math.max(inner, 0.0)
  const r = Math.max(outer, 0.0)
  const dr = (r - r0) / 2.0
  const mid = r0 + dr
  const pts: Pt[] = []
  const capSteps = 12
  // The start cap: from the inner edge round the back to the outer edge.
  const c0 = { x: center.x + Math.cos(lo) * mid, y: center.y + Math.sin(lo) * mid }
  for (let i = 0; i <= capSteps; i++) {
    const phi = lo + Math.PI + (Math.PI * i) / capSteps
    pts.push({ x: c0.x + Math.cos(phi) * dr, y: c0.y + Math.sin(phi) * dr })
  }
  const sweep = hi - lo
  const steps = Math.max(2, Math.ceil((sweep / (Math.PI * 2.0)) * 64.0))
  for (let i = 0; i <= steps; i++) {
    const a = lo + (sweep * i) / steps
    pts.push({ x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r })
  }
  // The end cap: from the outer edge round the front to the inner edge.
  const c1 = { x: center.x + Math.cos(hi) * mid, y: center.y + Math.sin(hi) * mid }
  for (let i = 0; i <= capSteps; i++) {
    const phi = hi + (Math.PI * i) / capSteps
    pts.push({ x: c1.x + Math.cos(phi) * dr, y: c1.y + Math.sin(phi) * dr })
  }
  for (let i = steps; i >= 0; i--) {
    const a = lo + (sweep * i) / steps
    pts.push({ x: center.x + Math.cos(a) * r0, y: center.y + Math.sin(a) * r0 })
  }
  return pts
}

/** The dial's draw commands for a gauge centred at `center` with radius `r`. */
export function renderDial(spec: DialSpec, center: Pt, r: Double): DrawCmd[] {
  const layers: Layered[] = []
  let seq = 0.0
  const dir = spec.clockwise ? 1.0 : -1.0
  const span = dir * spec.sweep
  const start = spec.start

  // The axis line, one band per colour stop. ECharts adds them last stop first.
  if (spec.lineShow) {
    let prev = start
    const bands: DrawCmd[] = []
    for (const s of spec.stops) {
      const at = start + span * Math.min(Math.max(s.at, 0.0), 1.0)
      bands.push(band(center, r, r - spec.lineWidth, prev, at, s.color, spec.lineRound))
      prev = at
    }
    for (let i = bands.length - 1; i >= 0; i--) {
      layers.push({ z: 0.0, seq, cmd: bands[i]! })
      seq = seq + 1.0
    }
  }

  // Split lines, labels and ticks, walking the dial.
  const splitLen = dialLen(spec.splitLength, r)
  const tickLen = dialLen(spec.tickLength, r)
  const step = span / spec.splitNumber
  const subStep = step / spec.tickSplit
  let angle = start
  for (let i = 0; i <= spec.splitNumber; i++) {
    const ux = Math.cos(angle)
    const uy = Math.sin(angle)
    if (spec.splitShow) {
      const d = spec.splitDistance !== 0.0 ? spec.splitDistance + spec.lineWidth : spec.lineWidth
      const stroke = spec.splitColor === 'auto' ? dialColor(spec.stops, i / spec.splitNumber) : spec.splitColor
      layers.push({ z: 0.0, seq, cmd: { kind: 'line', from: { x: ux * (r - d) + center.x, y: uy * (r - d) + center.y }, to: { x: ux * (r - splitLen - d) + center.x, y: uy * (r - splitLen - d) + center.y }, stroke, width: spec.splitWidth } })
      seq = seq + 1.0
    }
    if (spec.labelShow && i < spec.labels.length) {
      const d = spec.labelDistance + spec.splitDistance
      const at = { x: ux * (r - splitLen - d) + center.x, y: uy * (r - splitLen - d) + center.y }
      const fill = spec.labelColor === '' ? dialColor(spec.stops, i / spec.splitNumber) : spec.labelColor
      let rot = 0.0
      if (spec.labelRotate === 'radial') {
        rot = -angle + Math.PI * 2.0
        if (rot > Math.PI / 2.0) rot = rot + Math.PI
      } else if (spec.labelRotate === 'tangential') {
        rot = -angle - Math.PI / 2.0
      } else if (spec.labelRotate === 'fixed') {
        rot = (spec.labelDegrees * Math.PI) / 180.0
      }
      if (rot === 0.0) {
        const baseline = uy < -0.8 ? 'top' : uy > 0.8 ? 'bottom' : 'middle'
        const align = ux < -0.4 ? 'start' : ux > 0.4 ? 'end' : 'middle'
        layers.push({ z: 0.0, seq, cmd: { kind: 'text', text: spec.labels[i]!, at, fill, size: spec.labelSize, align, baseline } })
      } else {
        // zrender rotates counter-clockwise; the draw list clockwise, in degrees.
        layers.push({ z: 0.0, seq, cmd: { kind: 'text', text: spec.labels[i]!, at, fill, size: spec.labelSize, align: 'middle', baseline: 'middle', rotate: (-rot * 180.0) / Math.PI } })
      }
      seq = seq + 1.0
    }
    if (spec.tickShow && i !== spec.splitNumber) {
      const d = spec.tickDistance !== 0.0 ? spec.tickDistance + spec.lineWidth : spec.lineWidth
      for (let j = 0; j <= spec.tickSplit; j++) {
        const tx = Math.cos(angle)
        const ty = Math.sin(angle)
        const stroke = spec.tickColor === 'auto' ? dialColor(spec.stops, (i + j / spec.tickSplit) / spec.splitNumber) : spec.tickColor
        layers.push({ z: 0.0, seq, cmd: { kind: 'line', from: { x: tx * (r - d) + center.x, y: ty * (r - d) + center.y }, to: { x: tx * (r - tickLen - d) + center.x, y: ty * (r - tickLen - d) + center.y }, stroke, width: spec.tickWidth } })
        seq = seq + 1.0
        angle = angle + subStep
      }
      angle = angle - subStep
    } else {
      angle = angle + step
    }
  }

  // Each value's title and detail.
  const textZ = spec.pointerAbove ? 0.0 : 2.0
  for (const d of spec.data) {
    const auto = dialColor(spec.stops, fraction(d.value, spec.min, spec.max))
    if (spec.titleShow && d.name !== '') {
      const at = { x: center.x + dialLen(d.titleX, r), y: center.y + dialLen(d.titleY, r) }
      layers.push({ z: textZ, seq, cmd: { kind: 'text', text: d.name, at, fill: spec.titleColor, size: spec.titleSize, align: 'middle', baseline: 'middle' } })
      seq = seq + 1.0
    }
    if (spec.detailShow && d.detail !== '') {
      const at = { x: center.x + dialLen(d.detailX, r), y: center.y + dialLen(d.detailY, r) }
      if (spec.detailBg !== '' || spec.detailBorderWidth > 0.0) {
        const pad = spec.detailPadding
        const bw = spec.detailWidth + pad[1]! + pad[3]!
        const bh = (spec.detailHeight >= 0.0 ? spec.detailHeight : spec.detailSize) + pad[0]! + pad[2]!
        const box = { x: at.x - bw / 2.0, y: at.y - bh / 2.0, w: bw, h: bh }
        if (spec.detailBg !== '') {
          layers.push({ z: textZ, seq, cmd: { kind: 'rect', rect: box, fill: spec.detailBg } })
          seq = seq + 1.0
        }
        if (spec.detailBorderWidth > 0.0) {
          const edge: Pt[] = [{ x: box.x, y: box.y }, { x: box.x + box.w, y: box.y }, { x: box.x + box.w, y: box.y + box.h }, { x: box.x, y: box.y + box.h }, { x: box.x, y: box.y }]
          layers.push({ z: textZ, seq, cmd: { kind: 'polyline', points: edge, stroke: spec.detailBorder, width: spec.detailBorderWidth } })
          seq = seq + 1.0
        }
      }
      const fill = spec.detailColor !== '' ? spec.detailColor : spec.progressShow ? d.color : auto
      if (spec.detailBold) layers.push({ z: textZ, seq, cmd: { kind: 'text', text: d.detail, at, fill, size: spec.detailSize, align: 'middle', baseline: 'middle', weight: 'bold' } })
      else layers.push({ z: textZ, seq, cmd: { kind: 'text', text: d.detail, at, fill, size: spec.detailSize, align: 'middle', baseline: 'middle' } })
      seq = seq + 1.0
    }
  }

  // The anchor.
  if (spec.anchorShow) {
    const at = { x: center.x + dialLen(spec.anchorX, r), y: center.y + dialLen(spec.anchorY, r) }
    const half = spec.anchorSize / 2.0
    const z = spec.anchorAbove ? 1.0 : 0.0
    if (spec.anchorIcon !== 'circle') {
      const cell = { x: at.x - half, y: at.y - half, w: spec.anchorSize, h: spec.anchorSize }
      layers.push({ z, seq, cmd: { kind: 'polygon', points: iconPoints(spec.anchorIcon, cell), fill: spec.anchorColor } })
      if (spec.anchorBorderWidth > 0.0) {
        seq = seq + 1.0
        // A closed outline: the icon's points, back to the first.
        const ring: Pt[] = []
        for (const p of iconPoints(spec.anchorIcon, cell)) ring.push(p)
        ring.push(ring[0]!)
        layers.push({ z, seq, cmd: { kind: 'polyline', points: ring, stroke: spec.anchorBorder, width: spec.anchorBorderWidth } })
      }
    } else if (spec.anchorBorderWidth > 0.0) {
      // A stroke sits across the edge: half out, half in.
      layers.push({ z, seq, cmd: { kind: 'circle', center: at, radius: half + spec.anchorBorderWidth / 2.0, fill: spec.anchorBorder } })
      seq = seq + 1.0
      layers.push({ z, seq, cmd: { kind: 'circle', center: at, radius: Math.max(0.0, half - spec.anchorBorderWidth / 2.0), fill: spec.anchorColor } })
    } else {
      layers.push({ z, seq, cmd: { kind: 'circle', center: at, radius: half, fill: spec.anchorColor } })
    }
    seq = seq + 1.0
  }

  // Each value's pointer, then its progress arc.
  const count = spec.data.length
  // The ring index as a Double: a non-overlapping progress arc steps in by it.
  let ring = 0.0
  for (let i = 0; i < count; i++) {
    const d = spec.data[i]!
    const f = fraction(d.value, spec.min, spec.max)
    const auto = dialColor(spec.stops, f)
    if (spec.pointerShow) {
      const a = start + span * f
      const fill = d.pointerColor === 'auto' ? auto : d.pointerColor !== '' ? d.pointerColor : d.color
      const len = dialLen(spec.pointerLength, r)
      const w = dialLen(spec.pointerWidth, r)
      const ox = dialLen(spec.pointerX, r)
      const oy = dialLen(spec.pointerY, r)
      const points = spec.pointerIcon === '' ? pointerPoints(center, a, len, w, ox, oy) : turnAbout(center, a, iconPoints(spec.pointerIcon, { x: ox - w / 2.0, y: oy - len, w, h: len }))
      layers.push({ z: 0.0, seq, cmd: { kind: 'polygon', points, fill } })
      seq = seq + 1.0
    }
    if (spec.progressShow) {
      const raw = spec.max === spec.min ? 0.0 : (d.value - spec.min) / (spec.max - spec.min)
      const t = spec.progressClip ? f : raw
      const width = spec.progressOverlap ? spec.progressWidth : spec.lineWidth / (count * 1.0)
      const outer = spec.progressOverlap ? r : r - ring * width
      const fill = d.progressColor === 'auto' ? auto : d.progressColor !== '' ? d.progressColor : d.color
      // Overlapping arcs: a smaller value paints over a larger one (ECharts' z2 of 100..0).
      const z = spec.progressOverlap ? 100.0 - f * 100.0 : 0.0
      layers.push({ z, seq, cmd: band(center, outer, outer - width, start, start + span * t, fill, spec.progressRound) })
      seq = seq + 1.0
    }
    ring = ring + 1.0
  }

  // Paint order: z, then the order added (a stable sort).
  layers.sort((p, q) => (p.z !== q.z ? p.z - q.z : p.seq - q.seq))
  const out: DrawCmd[] = []
  for (const l of layers) out.push(l.cmd)
  return out
}

/**
 * ECharts' default pointer (`PointerPath`): a needle `len` long and `w` wide,
 * with a short tail, turned to `angle` about the centre and moved by (ox, oy)
 * in its own upright frame.
 */
export function pointerPoints(center: Pt, angle: Double, len: Double, w: Double, ox: Double, oy: Double): Pt[] {
  const k = w >= len / 3.0 ? 1.0 : 2.0
  const local: Pt[] = [
    { x: ox, y: oy + w * k },
    { x: ox - w, y: oy },
    { x: ox, y: oy - len },
    { x: ox + w, y: oy },
  ]
  return turnAbout(center, angle, local)
}

/** Points drawn upright about the origin, turned to `angle` and moved to `center`. */
function turnAbout(center: Pt, angle: Double, local: Pt[]): Pt[] {
  // Upright is -PI/2.
  const turn = angle + Math.PI / 2.0
  const c = Math.cos(turn)
  const s = Math.sin(turn)
  const out: Pt[] = []
  for (const p of local) out.push({ x: center.x + p.x * c - p.y * s, y: center.y + p.x * s + p.y * c })
  return out
}

/**
 * An ECharts symbol's outline in a cell: the shapes `symbolPoints` draws, and
 * the arrow, which ECharts starts from the cell's CENTRE (so it reaches past
 * the cell's bottom edge, as it does in ECharts).
 */
export function iconPoints(icon: string, cell: Rect): Pt[] {
  if (icon === 'arrow') {
    const x = cell.x + cell.w / 2.0
    const y = cell.y + cell.h / 2.0
    const dx = (cell.w / 3.0) * 2.0
    return [
      { x, y },
      { x: x + dx, y: y + cell.h },
      { x, y: y + (cell.h / 4.0) * 3.0 },
      { x: x - dx, y: y + cell.h },
    ]
  }
  return symbolPoints(cell, icon === 'emptyCircle' ? 'circle' : icon)
}
