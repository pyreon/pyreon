/**
 * Where a tooltip box goes, per ECharts' `tooltip.position`: following the
 * pointer (undefined), a side of the hovered item, a fixed point, or the
 * author's own function. Shared by the cartesian option path and every family
 * host, so the same `position` puts the box in the same place on both.
 */
import type { TooltipView } from './canvas-host'
import type { TooltipSpec } from './option-tooltip'
import type { Double, Pt, Rect } from './types'

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * The box's placement for a view. `anchor` is the hovered item's drawn rect
 * (null when unknown: the sides then sit against the pointer); `view` is the
 * chart's size, which percent and `r:`/`b:` offsets are taken of.
 */
export function tooltipPlace(spec: TooltipSpec, anchor: Rect | null, params: unknown, view: { w: Double; h: Double }): TooltipView['place'] {
  const pos = spec.position
  if (pos.kind === 'follow') return undefined
  const coord = (v: string | number, extent: Double, box: Double): Double => {
    if (typeof v === 'number') return v
    if (v.startsWith('r:')) return extent - box - Number.parseFloat(v.slice(2))
    if (v.startsWith('b:')) return extent - box - Number.parseFloat(v.slice(2))
    if (v.endsWith('%')) return (Number.parseFloat(v) / 100.0) * extent
    const n = Number.parseFloat(v)
    return Number.isFinite(n) ? n : 0.0
  }
  const side = (name: string, size: { w: Double; h: Double }, at: Pt): Pt => {
    const r = anchor ?? { x: at.x, y: at.y, w: 0.0, h: 0.0 }
    const gap = 10.0
    if (name === 'inside') return { x: r.x + r.w / 2.0 - size.w / 2.0, y: r.y + r.h / 2.0 - size.h / 2.0 }
    if (name === 'top') return { x: r.x + r.w / 2.0 - size.w / 2.0, y: r.y - size.h - gap }
    if (name === 'bottom') return { x: r.x + r.w / 2.0 - size.w / 2.0, y: r.y + r.h + gap }
    if (name === 'left') return { x: r.x - size.w - gap, y: r.y + r.h / 2.0 - size.h / 2.0 }
    return { x: r.x + r.w + gap, y: r.y + r.h / 2.0 - size.h / 2.0 }
  }
  return (at, size) => {
    if (pos.kind === 'side') return side(pos.side, size, at)
    if (pos.kind === 'point') return { x: coord(pos.x, view.w, size.w), y: coord(pos.y, view.h, size.h) }
    const out = pos.fn([at.x, at.y], params, null, anchor === null ? undefined : { x: anchor.x, y: anchor.y, width: anchor.w, height: anchor.h }, { contentSize: [size.w, size.h], viewSize: [view.w, view.h] })
    if (typeof out === 'string') return side(out, size, at)
    if (Array.isArray(out) && out.length === 2) return { x: coord(out[0] as string | number, view.w, size.w), y: coord(out[1] as string | number, view.h, size.h) }
    if (isObj(out)) {
      const x = out['left'] !== undefined ? coord(out['left'] as string | number, view.w, size.w) : out['right'] !== undefined ? view.w - size.w - coord(out['right'] as string | number, view.w, size.w) : at.x
      const y = out['top'] !== undefined ? coord(out['top'] as string | number, view.h, size.h) : out['bottom'] !== undefined ? view.h - size.h - coord(out['bottom'] as string | number, view.h, size.h) : at.y
      return { x, y }
    }
    return at
  }
}
