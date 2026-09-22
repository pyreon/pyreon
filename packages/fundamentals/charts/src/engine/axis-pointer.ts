/**
 * ECharts' axis pointer — the guide an axis-triggered tooltip draws at the
 * hovered category: a `line` through the column, a `shadow` over the whole
 * band, or a `cross` (the line, a horizontal line at the pointer, and the two
 * axis values in label boxes).
 *
 * Pure geometry over the plot rect, so the same commands paint on every
 * surface that has a plot.
 */
import type { DrawCmd, Double, Rect } from './types'

export interface AxisPointerStyle {
  type: 'line' | 'shadow' | 'cross' | 'none'
  /** Line / cross colour; ECharts' default is a mid grey. */
  color: string
  width: Double
  dashed: boolean
  /** Band fill for `shadow`. */
  shadowColor: string
  /** Draw the axis-value label boxes (`cross` by default). */
  label: boolean
  labelFill: string
  labelText: string
  fontSize: Double
}

export const AXIS_POINTER_DEFAULTS: AxisPointerStyle = {
  type: 'line',
  color: '#555555',
  width: 1.0,
  dashed: false,
  shadowColor: 'rgba(150,150,150,0.3)',
  label: false,
  labelFill: '#6e7079',
  labelText: '#ffffff',
  fontSize: 12.0,
}

export interface AxisPointerAt {
  /** The hovered category's centre, in plot coordinates. */
  x: Double
  /** The category band's width (the `shadow`'s width). */
  band: Double
  /** The pointer's height, for `cross`; null when it is off the plot. */
  y: Double | null
  /** The category's label and, for `cross`, the value at `y`. */
  categoryLabel: string
  valueLabel: string
}

/** The axis pointer's commands for a plot. */
export function axisPointerCmds(plot: Rect, at: AxisPointerAt, style: AxisPointerStyle): DrawCmd[] {
  const out: DrawCmd[] = []
  if (style.type === 'none') return out
  const dash: Double[] | undefined = style.dashed ? [4.0, 4.0] : undefined
  if (style.type === 'shadow') {
    out.push({ kind: 'rect', rect: { x: at.x - at.band / 2.0, y: plot.y, w: at.band, h: plot.h }, fill: style.shadowColor })
    return out
  }
  out.push({ kind: 'line', from: { x: at.x, y: plot.y }, to: { x: at.x, y: plot.y + plot.h }, stroke: style.color, width: style.width, dash })
  const y = at.y
  if (style.type === 'cross' && y !== null) {
    out.push({ kind: 'line', from: { x: plot.x, y }, to: { x: plot.x + plot.w, y }, stroke: style.color, width: style.width, dash })
  }
  if (!style.label) return out
  const pad = 4.0
  const h = style.fontSize + pad * 2.0
  const chars = (t: string): Double => t.length * style.fontSize * 0.6 + pad * 2.0
  // The category value, in a box on the x axis under the line.
  const cw = chars(at.categoryLabel)
  out.push({ kind: 'rect', rect: { x: at.x - cw / 2.0, y: plot.y + plot.h, w: cw, h }, fill: style.labelFill })
  out.push({ kind: 'text', text: at.categoryLabel, at: { x: at.x, y: plot.y + plot.h + h / 2.0 }, fill: style.labelText, size: style.fontSize, align: 'middle', baseline: 'middle' })
  if (style.type === 'cross' && y !== null) {
    const vw = chars(at.valueLabel)
    out.push({ kind: 'rect', rect: { x: plot.x - vw, y: y - h / 2.0, w: vw, h }, fill: style.labelFill })
    out.push({ kind: 'text', text: at.valueLabel, at: { x: plot.x - pad, y }, fill: style.labelText, size: style.fontSize, align: 'end', baseline: 'middle' })
  }
  return out
}
