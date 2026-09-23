// Web backend — executes a DrawCmd[] against a 2D canvas context.
//
// This is the whole platform-specific half on web: ~100 lines with no chart
// knowledge in it. The iOS and Android backends are the same shape against
// SwiftUI `Canvas` and Compose `Canvas`, which is the point of emitting a flat
// command list rather than drawing directly.

import { signal } from '@pyreon/reactivity'
import { cornerRadii, hasCorners } from './corners'
import { patternImageCells, patternMarks } from './pattern'
import type { ChartGradient, ChartPattern, DrawCmd, MeasureText, Pt, Rect } from './types'

/**
 * Text measurement backed by the canvas itself, for `computeLayout`.
 *
 * The context's font is set and restored around the measurement: layout runs
 * before drawing, and leaving a different font behind would silently change
 * how every later label renders.
 */
export function canvasMeasure(ctx: CanvasRenderingContext2D, fontFamily: string): MeasureText {
  // Memoized per measurer: a frame measures every tick label, every legend
  // entry and every preset button, and a hover re-measures the same strings.
  // `measureText` is a real layout call in Chromium; the cache turns the
  // repeats into a Map lookup. Bounded, and the bound is per FONT — a new
  // family or a new context gets a new measurer and a new cache.
  const cache = new Map<string, number>()
  return (text, fontSize) => {
    const key = fontSize + '|' + text
    const hit = cache.get(key)
    if (hit !== undefined) return hit
    const prev = ctx.font
    ctx.font = `${fontSize}px ${fontFamily}`
    const w = ctx.measureText(text).width
    ctx.font = prev
    if (cache.size >= 4096) cache.clear()
    cache.set(key, w)
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

/** A radial gradient's radius — the distance from its centre to the point on its outer circle. */
function gradientRadius(grad: ChartGradient): number {
  return Math.hypot(grad.to.x - grad.from.x, grad.to.y - grad.from.y)
}

/** A canvas gradient from the engine's stops — or the solid fill when it has none. */
function fillStyleFor(
  ctx: CanvasRenderingContext2D,
  fill: string,
  grad: ChartGradient | undefined,
): string | CanvasGradient {
  if (grad === undefined || grad.stops.length === 0) return fill
  const g = grad.radial
    ? ctx.createRadialGradient(grad.from.x, grad.from.y, 0, grad.from.x, grad.from.y, gradientRadius(grad))
    : ctx.createLinearGradient(grad.from.x, grad.from.y, grad.to.x, grad.to.y)
  for (const st of grad.stops) g.addColorStop(Math.min(1, Math.max(0, st.offset)), st.color)
  return g
}

function tracePolyline(ctx: CanvasRenderingContext2D, points: Pt[]): void {
  ctx.beginPath()
  ctx.moveTo(points[0]!.x, points[0]!.y)
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x, points[i]!.y)
}

/** Bounded: a chart names a handful of textures; an unbounded map would grow with every URL ever drawn. */
const IMAGE_CACHE_LIMIT = 64
const imageCache = new Map<string, HTMLImageElement>()
/**
 * Bumped when a pattern image finishes loading. `chartImage` reads it, so the
 * canvas host's draw effect — the only tracked caller — repaints once the
 * texture exists instead of leaving the first, image-less frame on screen.
 */
const imageVersion = signal(0)

/**
 * Subscribe the caller to pattern-image loads. The canvas host's draw effect
 * calls this so a frame first painted before its texture arrived repaints —
 * the first paint can run outside the effect (when the canvas ref attaches),
 * where the read inside `chartImage` would track nothing.
 */
export function trackChartImages(): void {
  imageVersion()
}

function chartImage(src: string): HTMLImageElement | null {
  let img = imageCache.get(src)
  if (img === undefined) {
    if (typeof Image !== 'function') return null
    img = new Image()
    img.onload = () => imageVersion.set(imageVersion.peek() + 1)
    img.src = src
    imageCache.set(src, img)
    if (imageCache.size > IMAGE_CACHE_LIMIT) {
      const oldest = imageCache.keys().next().value
      if (oldest !== undefined) imageCache.delete(oldest)
    }
  }
  return img.complete && img.naturalWidth > 0 ? img : null
}

function paintPattern(ctx: CanvasRenderingContext2D, pattern: ChartPattern | undefined, bounds: Rect): void {
  if (pattern === undefined) return
  ctx.save()
  ctx.clip()
  if (pattern.kind === 'image' && pattern.image !== undefined) {
    const img = chartImage(pattern.image)
    if (img !== null) {
      for (const cell of patternImageCells(pattern, bounds, img.naturalWidth, img.naturalHeight)) {
        ctx.drawImage(img, cell.x, cell.y, cell.w, cell.h)
      }
    }
  }
  for (const m of patternMarks(pattern, bounds)) {
    if (m.kind === 'line') {
      ctx.strokeStyle = m.stroke
      ctx.lineWidth = m.width
      ctx.beginPath()
      ctx.moveTo(m.from.x, m.from.y)
      ctx.lineTo(m.to.x, m.to.y)
      ctx.stroke()
    } else if (m.kind === 'circle') {
      ctx.fillStyle = m.fill
      ctx.beginPath()
      ctx.arc(m.center.x, m.center.y, m.radius, 0, Math.PI * 2)
      ctx.fill()
    } else if (m.kind === 'polygon') {
      ctx.fillStyle = m.fill
      ctx.beginPath()
      tracePolyline(ctx, m.points)
      ctx.closePath()
      ctx.fill()
    }
  }
  ctx.restore()
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
  // Open clips: an `unclip` with none open is ignored, so it can never pop the frame's own save.
  let clips = 0
  for (const c of cmds) {
    if (c.kind === 'clip') {
      ctx.save()
      ctx.beginPath()
      ctx.rect(c.rect.x, c.rect.y, c.rect.w, c.rect.h)
      ctx.clip()
      clips++
    } else if (c.kind === 'unclip') {
      if (clips > 0) {
        ctx.restore()
        clips--
      }
    } else if (c.kind === 'rect') {
      ctx.fillStyle = fillStyleFor(ctx, c.fill, c.grad)
      const radii = cornerRadii(c.rect, c.corners)
      if (hasCorners(radii)) {
        traceRoundedRect(ctx, c.rect.x, c.rect.y, c.rect.w, c.rect.h, radii)
        ctx.fill()
      } else {
        ctx.fillRect(c.rect.x, c.rect.y, c.rect.w, c.rect.h)
      }
      if (c.pattern !== undefined) {
        if (hasCorners(radii)) traceRoundedRect(ctx, c.rect.x, c.rect.y, c.rect.w, c.rect.h, radii)
        else {
          ctx.beginPath()
          ctx.rect(c.rect.x, c.rect.y, c.rect.w, c.rect.h)
        }
        paintPattern(ctx, c.pattern, c.rect)
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
        ctx.fillStyle = fillStyleFor(ctx, c.fill, c.grad)
        tracePolyline(ctx, c.points)
        ctx.closePath()
        ctx.fill()
        if (c.pattern !== undefined) {
          tracePolyline(ctx, c.points)
          ctx.closePath()
          const xs = c.points.map((p) => p.x)
          const ys = c.points.map((p) => p.y)
          const x = Math.min(...xs)
          const y = Math.min(...ys)
          paintPattern(ctx, c.pattern, { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y })
        }
      }
    } else if (c.kind === 'circle') {
      ctx.fillStyle = c.fill
      ctx.beginPath()
      ctx.arc(c.center.x, c.center.y, c.radius, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.fillStyle = c.fill
      ctx.font = `${c.weight === 'bold' ? 'bold ' : ''}${c.size}px ${fontFamily}`
      ctx.textAlign = c.align === 'middle' ? 'center' : c.align
      ctx.textBaseline =
        c.baseline === 'middle' ? 'middle' : c.baseline === 'top' ? 'top' : 'alphabetic'
      const rot = c.rotate ?? 0
      // A halo is stroked under the fill, as zrender paints a textBorder.
      const paintText = (x: number, y: number): void => {
        if (c.stroke !== undefined && c.stroke !== '') {
          ctx.strokeStyle = c.stroke
          ctx.lineWidth = c.strokeWidth ?? 2
          ctx.lineJoin = 'miter'
          ctx.miterLimit = 2
          ctx.strokeText(c.text, x, y)
        }
        ctx.fillText(c.text, x, y)
      }
      if (rot !== 0) {
        // Rotate about the anchor: the text's own align/baseline then apply
        // in the rotated frame, which is what a slanted axis label wants.
        ctx.save()
        ctx.translate(c.at.x, c.at.y)
        ctx.rotate((rot * Math.PI) / 180)
        paintText(0, 0)
        ctx.restore()
      } else {
        paintText(c.at.x, c.at.y)
      }
    }
  }
  // A list that left a clip open does not leak it into the next frame.
  while (clips > 0) {
    ctx.restore()
    clips--
  }
  ctx.restore()
}

/**
 * The `<canvas>` size as vnode props, for the server-rendered element.
 *
 * `prepareCanvas` sizes the element on the client only, so an SSR canvas
 * carried no size at all and laid out at the HTML default (300x150) until the
 * first paint resized it — a guaranteed layout shift on hydrate. The style
 * fixes the CSS box; the attributes give the same box to a no-CSS reader.
 * Width is omitted when it is measured from the container (auto width): a
 * wrong guess would be a shift of its own.
 */
export function canvasSizeAttrs(
  width: number | undefined,
  height: number,
  ownsTouches: boolean,
): { style: string; width?: number; height: number } {
  const size = width === undefined ? `height:${height}px` : `width:${width}px;height:${height}px`
  return {
    // A zoomable/brushable/navigable chart owns its touches; a static one
    // leaves the page free to scroll over it.
    style: ownsTouches ? `${size};touch-action:none` : size,
    ...(width === undefined ? {} : { width }),
    height,
  }
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
  background: string = '',
): CanvasRenderingContext2D | null {
  // The theme's ground, or transparent — set on the element so it survives every repaint.
  canvas.style.background = background
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
