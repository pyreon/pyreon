// Web backend — executes a DrawCmd[] against a 2D canvas context.
//
// This is the whole platform-specific half on web: ~100 lines with no chart
// knowledge in it. The iOS and Android backends are the same shape against
// SwiftUI `Canvas` and Compose `Canvas`, which is the point of emitting a flat
// command list rather than drawing directly.

import { cornerRadii, hasCorners } from './corners'
import type { DrawCmd, MeasureText, Pt } from './types'

/**
 * Text measurement backed by the canvas itself, for `computeLayout`.
 *
 * The context's font is set and restored around the measurement: layout runs
 * before drawing, and leaving a different font behind would silently change
 * how every later label renders.
 */
export function canvasMeasure(ctx: CanvasRenderingContext2D, fontFamily: string): MeasureText {
  return (text, fontSize) => {
    const prev = ctx.font
    ctx.font = `${fontSize}px ${fontFamily}`
    const w = ctx.measureText(text).width
    ctx.font = prev
    return w
  }
}

/**
 * Trace a rounded rect.
 *
 * Arcs rather than `ctx.roundRect`: the radii are already clamped by the
 * engine, the arc form works on every 2D context (including the ones a test
 * environment provides), and it is the same four arcs the SVG path and both
 * native canvases draw — which is what keeps the four backends visually
 * identical rather than approximately so.
 */
function traceRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number[],
): void {
  const tl = r[0]!
  const tr = r[1]!
  const br = r[2]!
  const bl = r[3]!
  ctx.beginPath()
  ctx.moveTo(x + tl, y)
  ctx.lineTo(x + w - tr, y)
  if (tr > 0) ctx.arc(x + w - tr, y + tr, tr, -Math.PI / 2, 0)
  ctx.lineTo(x + w, y + h - br)
  if (br > 0) ctx.arc(x + w - br, y + h - br, br, 0, Math.PI / 2)
  ctx.lineTo(x + bl, y + h)
  if (bl > 0) ctx.arc(x + bl, y + h - bl, bl, Math.PI / 2, Math.PI)
  ctx.lineTo(x, y + tl)
  if (tl > 0) ctx.arc(x + tl, y + tl, tl, Math.PI, Math.PI * 1.5)
  ctx.closePath()
}

function tracePolyline(ctx: CanvasRenderingContext2D, points: Pt[]): void {
  ctx.beginPath()
  ctx.moveTo(points[0]!.x, points[0]!.y)
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x, points[i]!.y)
}

/**
 * Paint a command list.
 *
 * Clears first, so a redraw on a data change replaces the previous frame rather
 * than compositing over it. `save`/`restore` bracket the whole pass so the
 * caller's context settings survive — a chart is usually one element on a
 * canvas the host also draws to.
 */
export function paint(
  ctx: CanvasRenderingContext2D,
  cmds: DrawCmd[],
  width: number,
  height: number,
  fontFamily: string,
): void {
  ctx.save()
  ctx.clearRect(0, 0, width, height)
  for (const c of cmds) {
    if (c.kind === 'rect') {
      ctx.fillStyle = c.fill
      const radii = cornerRadii(c.rect, c.corners)
      if (hasCorners(radii)) {
        traceRoundedRect(ctx, c.rect.x, c.rect.y, c.rect.w, c.rect.h, radii)
        ctx.fill()
      } else {
        ctx.fillRect(c.rect.x, c.rect.y, c.rect.w, c.rect.h)
      }
    } else if (c.kind === 'line') {
      ctx.strokeStyle = c.stroke
      ctx.lineWidth = c.width
      // Set AND reset per command: a dash left on the context would turn every
      // later solid stroke in the same frame into a dashed one.
      ctx.setLineDash(c.dash ?? [])
      ctx.beginPath()
      ctx.moveTo(c.from.x, c.from.y)
      ctx.lineTo(c.to.x, c.to.y)
      ctx.stroke()
      ctx.setLineDash([])
    } else if (c.kind === 'polyline') {
      if (c.points.length > 1) {
        ctx.strokeStyle = c.stroke
        ctx.lineWidth = c.width
        ctx.setLineDash(c.dash ?? [])
        // Round joins/caps: a polyline through steep data otherwise grows
        // visible spikes at the vertices from mitred corners.
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        tracePolyline(ctx, c.points)
        ctx.stroke()
        ctx.setLineDash([])
      }
    } else if (c.kind === 'polygon') {
      if (c.points.length > 2) {
        ctx.fillStyle = c.fill
        tracePolyline(ctx, c.points)
        ctx.closePath()
        ctx.fill()
      }
    } else if (c.kind === 'circle') {
      ctx.fillStyle = c.fill
      ctx.beginPath()
      ctx.arc(c.center.x, c.center.y, c.radius, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.fillStyle = c.fill
      ctx.font = `${c.size}px ${fontFamily}`
      ctx.textAlign = c.align === 'middle' ? 'center' : c.align
      ctx.textBaseline =
        c.baseline === 'middle' ? 'middle' : c.baseline === 'top' ? 'top' : 'alphabetic'
      ctx.fillText(c.text, c.at.x, c.at.y)
    }
  }
  ctx.restore()
}

/**
 * Size a canvas for the device pixel ratio and return its context.
 *
 * Without the DPR scale a chart is visibly soft on every retina display — the
 * backing store is half the resolution of the CSS box. The transform is set
 * rather than multiplied so repeated resizes cannot compound it.
 */
export function prepareCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): CanvasRenderingContext2D | null {
  const dpr = typeof globalThis.devicePixelRatio === 'number' ? globalThis.devicePixelRatio : 1
  canvas.width = Math.max(1, Math.round(width * dpr))
  canvas.height = Math.max(1, Math.round(height * dpr))
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  const ctx = canvas.getContext('2d')
  if (ctx === null) return null
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}
