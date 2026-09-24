// The visualMap strip — ECharts' value → colour legend, and its interaction.
//
// One geometry for every target: the web canvas hosts, the SVG serializer and
// the SwiftUI / Compose hosts all draw these commands and hit-test with these
// functions, so a dragged handle lands on the same value everywhere.
//
// A continuous strip is a ramp; when `calculable`, two handles select the
// in-range interval and values outside it take `outColor`. A piecewise strip
// is a list of swatches; clicking one toggles it, and values in an unselected
// piece take `outColor`. `visualColorFor` is the colouring rule the series
// renderers apply, so the strip and the data can never disagree.

import { plain } from './format'
import { rampColor } from './heat'
import type { Domain, Double, DrawCmd, Pt } from './types'

export interface VisualPiece {
  label: string
  color: string
  /** Lower bound, inclusive; absent = unbounded. */
  min?: Double | undefined
  /** Upper bound, inclusive; absent = unbounded. */
  max?: Double | undefined
}

export interface VisualStrip {
  piecewise: boolean
  stops: string[]
  domain: Domain
  pieces: VisualPiece[]
  vertical: boolean
  /** End labels (continuous); empty strings use the domain ends. */
  highText: string
  lowText: string
  fontSize: Double
  labelColor: string
  /** Bar thickness / swatch size. */
  itemSize: Double
  /** Bar length (continuous). */
  itemLength: Double
  /** Continuous: draggable handles. */
  calculable: boolean
  /** The colour an out-of-range value takes — ECharts' `inactiveColor`. */
  outColor: string
}

const STRIP_COUNT = 24.0
const STRIP_GAP = 4.0
const STRIP_HANDLE = 8.0

function labelWidth(s: VisualStrip): Double {
  return s.fontSize * 3.2
}

function pieceTextWidth(s: VisualStrip, label: string): Double {
  return label.length * s.fontSize * 0.55
}

function span(d: Domain): Double {
  return d.max - d.min
}

/** Where the bar starts, relative to the strip origin. */
function barOrigin(s: VisualStrip, at: Pt): Pt {
  if (s.vertical) return { x: at.x, y: at.y + s.fontSize + STRIP_GAP }
  return { x: at.x + labelWidth(s) + STRIP_GAP, y: at.y }
}

/** The strip's size. */
export function visualStripSize(s: VisualStrip): Pt {
  if (s.piecewise) {
    if (s.vertical) {
      let widest = 0.0
      for (const p of s.pieces) if (pieceTextWidth(s, p.label) > widest) widest = pieceTextWidth(s, p.label)
      let n = 0.0
      for (const _p of s.pieces) n = n + 1.0
      return { x: s.itemSize + STRIP_GAP + widest, y: n <= 0 ? 0.0 : n * (s.itemSize + STRIP_GAP) - STRIP_GAP }
    }
    let w = 0.0
    for (const p of s.pieces) w = w + s.itemSize + STRIP_GAP + pieceTextWidth(s, p.label) + STRIP_GAP * 2.0
    return { x: w <= 0.0 ? 0.0 : w - STRIP_GAP * 2.0, y: s.itemSize }
  }
  const handleSpace = s.calculable ? STRIP_HANDLE + STRIP_GAP + labelWidth(s) : 0.0
  if (s.vertical) {
    const w = s.itemSize + handleSpace
    return { x: w > labelWidth(s) ? w : labelWidth(s), y: s.fontSize * 2.0 + STRIP_GAP * 2.0 + s.itemLength }
  }
  // A calculable strip's handles hang below the bar, each with its value under it.
  return { x: labelWidth(s) * 2.0 + STRIP_GAP * 2.0 + s.itemLength, y: s.itemSize + (s.calculable ? STRIP_HANDLE + STRIP_GAP + s.fontSize + 2.0 : 0.0) }
}

/** The fraction (0 = low end) of a value along the domain, clamped. */
function fraction(s: VisualStrip, v: Double): Double {
  const sp = span(s.domain)
  if (!(sp > 0.0)) return 1.0
  const t = (v - s.domain.min) / sp
  return t < 0.0 ? 0.0 : t > 1.0 ? 1.0 : t
}

/** The point on the bar's centreline for a value. */
function valuePoint(s: VisualStrip, at: Pt, v: Double): Pt {
  const o = barOrigin(s, at)
  const t = fraction(s, v)
  if (s.vertical) return { x: o.x + s.itemSize, y: o.y + (1.0 - t) * s.itemLength }
  return { x: o.x + t * s.itemLength, y: o.y + s.itemSize }
}

/** Whether a value is inside a piece's bounds. */
export function pieceContains(p: VisualPiece, v: Double): boolean {
  if (p.min !== undefined && v < (p.min ?? v)) return false
  if (p.max !== undefined && v > (p.max ?? v)) return false
  return true
}

/**
 * Whether a value is shown: inside the continuous range, or inside a selected
 * piece. `selected` is per piece; a missing entry counts as selected.
 */
export function visualInRange(s: VisualStrip, v: Double, range: Domain, selected: boolean[]): boolean {
  if (s.piecewise) {
    let inAny = false
    for (let i = 0; i < s.pieces.length; i++) {
      if (!pieceContains(s.pieces[i]!, v)) continue
      inAny = true
      if (i >= selected.length || selected[i]!) return true
    }
    return !inAny
  }
  return v >= range.min && v <= range.max
}

/** The colour a series renderer paints a value with: the ramp, or `outColor` outside the selection. */
export function visualColorFor(s: VisualStrip, v: Double, range: Domain, selected: boolean[]): string {
  if (!visualInRange(s, v, range, selected)) return s.outColor
  if (s.piecewise) {
    for (const p of s.pieces) if (pieceContains(p, v)) return p.color
  }
  return rampColor(s.stops, fraction(s, v))
}

/** The strip's draw commands with its top-left at `at`. */
export function renderVisualStrip(s: VisualStrip, at: Pt, range: Domain, selected: boolean[]): DrawCmd[] {
  const out: DrawCmd[] = []
  const fs = s.fontSize
  if (s.piecewise) {
    let x = at.x
    let y = at.y
    for (let i = 0; i < s.pieces.length; i++) {
      const p = s.pieces[i]!
      const on = i >= selected.length || selected[i]!
      out.push({ kind: 'rect', rect: { x, y, w: s.itemSize, h: s.itemSize }, fill: on ? p.color : s.outColor })
      out.push({ kind: 'text', text: p.label, at: { x: x + s.itemSize + STRIP_GAP, y: y + s.itemSize / 2.0 }, fill: on ? s.labelColor : s.outColor, size: fs, align: 'start', baseline: 'middle' })
      if (s.vertical) y = y + s.itemSize + STRIP_GAP
      else x = x + s.itemSize + STRIP_GAP + pieceTextWidth(s, p.label) + STRIP_GAP * 2.0
    }
    return out
  }
  const o = barOrigin(s, at)
  const high = s.highText === '' ? plain(s.domain.max) : s.highText
  const low = s.lowText === '' ? plain(s.domain.min) : s.lowText
  let i = 0.0
  while (i < STRIP_COUNT) {
    // Vertical runs top-down (high first, like a thermometer); horizontal left to right.
    const t = s.vertical ? 1.0 - (i + 0.5) / STRIP_COUNT : (i + 0.5) / STRIP_COUNT
    const v = s.domain.min + t * span(s.domain)
    const fill = s.calculable && (v < range.min || v > range.max) ? s.outColor : rampColor(s.stops, t)
    if (s.vertical) {
      out.push({ kind: 'rect', rect: { x: o.x, y: o.y + (s.itemLength * i) / STRIP_COUNT, w: s.itemSize, h: s.itemLength / STRIP_COUNT + 0.5 }, fill })
    } else {
      out.push({ kind: 'rect', rect: { x: o.x + (s.itemLength * i) / STRIP_COUNT, y: o.y, w: s.itemLength / STRIP_COUNT + 0.5, h: s.itemSize }, fill })
    }
    i = i + 1.0
  }
  if (s.vertical) {
    out.push({ kind: 'text', text: high, at: { x: o.x + s.itemSize / 2.0, y: at.y }, fill: s.labelColor, size: fs, align: 'middle', baseline: 'top' })
    out.push({ kind: 'text', text: low, at: { x: o.x + s.itemSize / 2.0, y: o.y + s.itemLength + STRIP_GAP }, fill: s.labelColor, size: fs, align: 'middle', baseline: 'top' })
  } else {
    out.push({ kind: 'text', text: low, at: { x: o.x - STRIP_GAP, y: o.y + s.itemSize / 2.0 }, fill: s.labelColor, size: fs, align: 'end', baseline: 'middle' })
    out.push({ kind: 'text', text: high, at: { x: o.x + s.itemLength + STRIP_GAP, y: o.y + s.itemSize / 2.0 }, fill: s.labelColor, size: fs, align: 'start', baseline: 'middle' })
  }
  if (!s.calculable) return out
  const ends = [range.min, range.max]
  for (let e = 0; e < 2; e++) {
    const v = ends[e]!
    const p = valuePoint(s, at, v)
    const color = rampColor(s.stops, fraction(s, v))
    if (s.vertical) {
      // A triangle pointing at the bar from its right, the value beside it.
      out.push({ kind: 'polygon', points: [{ x: p.x, y: p.y }, { x: p.x + STRIP_HANDLE, y: p.y - STRIP_HANDLE / 2.0 }, { x: p.x + STRIP_HANDLE, y: p.y + STRIP_HANDLE / 2.0 }], fill: color })
      out.push({ kind: 'text', text: plain(v), at: { x: p.x + STRIP_HANDLE + STRIP_GAP, y: p.y }, fill: s.labelColor, size: fs, align: 'start', baseline: 'middle' })
    } else {
      out.push({ kind: 'polygon', points: [{ x: p.x, y: p.y }, { x: p.x - STRIP_HANDLE / 2.0, y: p.y + STRIP_HANDLE }, { x: p.x + STRIP_HANDLE / 2.0, y: p.y + STRIP_HANDLE }], fill: color })
      out.push({ kind: 'text', text: plain(v), at: { x: p.x, y: p.y + STRIP_HANDLE + STRIP_GAP }, fill: s.labelColor, size: fs, align: 'middle', baseline: 'top' })
    }
  }
  return out
}

/** Which handle (0 = low end, 1 = high end) is under a point, or -1. The nearer wins. */
export function visualStripHandleAt(s: VisualStrip, at: Pt, range: Domain, px: Double, py: Double): Double {
  if (s.piecewise || !s.calculable) return -1.0
  const reach = STRIP_HANDLE + 4.0
  let best = -1.0
  let bestD = reach * 1.5
  let e = 0.0
  while (e < 2.0) {
    const p = valuePoint(s, at, e === 0.0 ? range.min : range.max)
    const cx = s.vertical ? p.x + STRIP_HANDLE / 2.0 : p.x
    const cy = s.vertical ? p.y : p.y + STRIP_HANDLE / 2.0
    const d = Math.abs(px - cx) + Math.abs(py - cy)
    if (d <= bestD) {
      bestD = d
      best = e
    }
    e = e + 1.0
  }
  return best
}

/** The domain value under a point along the bar, clamped to the domain. */
export function visualStripValueAt(s: VisualStrip, at: Pt, px: Double, py: Double): Double {
  const o = barOrigin(s, at)
  const raw = s.vertical ? 1.0 - (py - o.y) / (s.itemLength > 0.0 ? s.itemLength : 1.0) : (px - o.x) / (s.itemLength > 0.0 ? s.itemLength : 1.0)
  const t = raw < 0.0 ? 0.0 : raw > 1.0 ? 1.0 : raw
  return s.domain.min + t * span(s.domain)
}

/** A dragged handle's new range: the moved end follows the value, never crossing the other. */
export function visualStripDrag(s: VisualStrip, range: Domain, handle: Double, value: Double): Domain {
  if (handle === 0.0) return { min: value < range.max ? value : range.max, max: range.max }
  return { min: range.min, max: value > range.min ? value : range.min }
}

/** The piece swatch (or its label) under a point, or -1. */
export function visualStripPieceAt(s: VisualStrip, at: Pt, px: Double, py: Double): Double {
  if (!s.piecewise) return -1.0
  let x = at.x
  let y = at.y
  let i = 0.0
  for (const piece of s.pieces) {
    const w = s.itemSize + STRIP_GAP + pieceTextWidth(s, piece.label)
    if (px >= x && px <= x + w && py >= y && py <= y + s.itemSize) return i
    i = i + 1.0
    if (s.vertical) y = y + s.itemSize + STRIP_GAP
    else x = x + w + STRIP_GAP * 2.0
  }
  return -1.0
}

/** A piece selection with one piece toggled. */
export function visualStripToggle(s: VisualStrip, selected: boolean[], index: Double): boolean[] {
  const out: boolean[] = []
  let i = 0.0
  for (const _p of s.pieces) {
    const on = i >= selected.length || selected[i]!
    out.push(i === index ? !on : on)
    i = i + 1.0
  }
  return out
}

/**
 * The selection as renderer options: the dragged range (continuous,
 * calculable) or the unselected pieces as flat `[lo, hi, …]` bands. An
 * unbounded piece end reaches the domain's far side, widened, so no value is
 * missed.
 */
export function visualOutBands(s: VisualStrip, selected: boolean[]): Double[] {
  const out: Double[] = []
  if (!s.piecewise) return out
  const reach = (s.domain.max - s.domain.min) * 1000.0 + 1000000.0
  let i = 0.0
  for (const p of s.pieces) {
    const on = i >= selected.length || selected[i]!
    if (!on) {
      out.push(p.min ?? s.domain.min - reach)
      out.push(p.max ?? s.domain.max + reach)
    }
    i = i + 1.0
  }
  return out
}

/** Where the strip goes in a `w × h` box and what is left for the chart. */
export interface VisualStripPlacement {
  /** The strip's top-left. */
  at: Pt
  /** The chart's box, from the origin: the strip takes the right edge (vertical) or the bottom (horizontal). */
  chartW: Double
  chartH: Double
}

export function visualStripPlace(s: VisualStrip, w: Double, h: Double): VisualStripPlacement {
  const size = visualStripSize(s)
  const margin = 8.0
  if (s.vertical) {
    const chartW = w - size.x - margin
    return { at: { x: w - size.x, y: h - size.y > 0.0 ? h - size.y : 0.0 }, chartW: chartW > 0.0 ? chartW : 0.0, chartH: h }
  }
  const chartH = h - size.y - margin
  return { at: { x: 0.0, y: h - size.y }, chartW: w, chartH: chartH > 0.0 ? chartH : 0.0 }
}

