// SVG backend — turns a DrawCmd[] into a standalone `<svg>` string.
//
// The second backend, and the one that proves the flat-command-list design was
// worth it: no chart knowledge lives here either, and it is a PURE function of
// the command list, so it needs no DOM and no canvas. Three things follow that
// canvas cannot give you:
//
//   - **Server rendering.** A chart in an SSG page or an email is a string, not
//     a surface. `renderChart` runs anywhere; so does this.
//   - **Resolution independence.** Print and 2x/3x displays get real vectors
//     rather than a rasterized backing store.
//   - **Inspectability.** The output is text, so it diffs, and a snapshot test
//     can assert on geometry rather than on pixels.
//
// Text measurement is the one thing it cannot do (no font metrics without a
// rendering context), which is why `measureApprox` exists — see its note.

import { cornerRadii, hasCorners } from './corners'
import { patternImageCells, patternMarks } from './pattern'
import type { ChartGradient, DrawCmd, Double, MeasureText, Pt, Rect } from './types'

/**
 * Round to at most 2 decimals and drop a trailing `.0`.
 *
 * Chart geometry is float arithmetic, so raw coordinates serialize as
 * `137.00000000000003`. Rounding is not cosmetic: it keeps the output stable
 * across platforms whose last-bit rounding differs, which is what lets a
 * snapshot test of an SVG be a real assertion rather than a flake.
 */
function n(v: Double): string {
  const r = Math.round(v * 100) / 100
  return Object.is(r, -0) ? '0' : String(r)
}

/**
 * Escape the five XML-significant characters.
 *
 * Labels are user data — a category called `Tom & Jerry` or a series named
 * `<script>` must not be able to change the document's structure. Ampersand is
 * replaced FIRST, or the escapes introduced after it would be double-escaped.
 */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function dashAttr(dash: Double[] | undefined): string {
  if (dash === undefined || dash.length === 0) return ''
  return ` stroke-dasharray="${dash.map((d) => n(d)).join(' ')}"`
}

function pointsAttr(points: Pt[]): string {
  return points.map((p) => `${n(p.x)},${n(p.y)}`).join(' ')
}

const ANCHOR: Record<'start' | 'middle' | 'end', string> = {
  start: 'start',
  middle: 'middle',
  end: 'end',
}

// SVG's `dominant-baseline` covers `top` and `middle` directly. `bottom` maps
// to `alphabetic` rather than `text-after-edge`: the canvas backend uses the
// alphabetic baseline for `bottom`, and the two backends have to agree or the
// same chart sits a few pixels apart depending on which one drew it.
const BASELINE: Record<'top' | 'middle' | 'bottom', string> = {
  top: 'hanging',
  middle: 'central',
  bottom: 'alphabetic',
}

/**
 * The `d` of a rounded rect — four arcs, sweep-flag 1 (clockwise in SVG's
 * y-down space), matching the canvas and native traces corner for corner.
 */
function roundedRectPath(x: Double, y: Double, w: Double, h: Double, r: Double[]): string {
  const tl = r[0]!
  const tr = r[1]!
  const br = r[2]!
  const bl = r[3]!
  const arc = (rad: Double, ex: Double, ey: Double): string =>
    rad > 0 ? `A${n(rad)} ${n(rad)} 0 0 1 ${n(ex)} ${n(ey)}` : ''
  return (
    `M${n(x + tl)} ${n(y)}` +
    `H${n(x + w - tr)}` +
    arc(tr, x + w, y + tr) +
    `V${n(y + h - br)}` +
    arc(br, x + w - br, y + h) +
    `H${n(x + bl)}` +
    arc(bl, x, y + h - bl) +
    `V${n(y + tl)}` +
    arc(tl, x + tl, y) +
    'Z'
  )
}

/**
 * The `<defs>` for every gradient in a command list, plus the id each one got.
 *
 * SVG cannot inline a gradient on a shape — it has to live in `<defs>` and be
 * referenced by id — so serializing a gradient-bearing command needs document
 * context that `svgCommand` alone does not have. `renderSvg` collects them
 * here; a caller composing its own document either does the same or accepts
 * the solid-fill fallback.
 */
export function collectGradients(cmds: DrawCmd[], prefix: string): { defs: string; ids: string[] } {
  const parts: string[] = []
  const ids: string[] = []
  let i = 0
  for (const c of cmds) {
    const g = c.kind === 'rect' || c.kind === 'polygon' ? c.grad : undefined
    if (g === undefined || g.stops.length === 0) {
      ids.push('')
      continue
    }
    const id = `${prefix}-g${i}`
    i += 1
    ids.push(id)
    const stops = g.stops
      .map((st) => `<stop offset="${n(Math.min(1, Math.max(0, st.offset)))}" stop-color="${esc(st.color)}"/>`)
      .join('')
    // userSpaceOnUse: the engine's points are chart coordinates, not fractions
    // of each shape's bounding box (the SVG default) — which is exactly what
    // makes one ramp span the plot instead of repeating per bar.
    parts.push(
      g.radial
        ? `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(g.from.x)}" cy="${n(g.from.y)}" r="${n(Math.hypot(g.to.x - g.from.x, g.to.y - g.from.y))}">${stops}</radialGradient>`
        : `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(g.from.x)}" y1="${n(g.from.y)}" x2="${n(g.to.x)}" y2="${n(g.to.y)}">${stops}</linearGradient>`,
    )
  }
  return { defs: parts.length === 0 ? '' : `<defs>${parts.join('')}</defs>`, ids }
}

/** Tile size for a fill image in SVG, where the natural size is unknowable at render time. */
const SVG_IMAGE_TILE = 32.0

export function collectPatterns(cmds: DrawCmd[], prefix: string): { defs: string; ids: string[] } {
  const parts: string[] = []
  const ids: string[] = []
  let i = 0
  for (const c of cmds) {
    const p = c.kind === 'rect' || c.kind === 'polygon' ? c.pattern : undefined
    if (p === undefined) { ids.push(''); continue }
    const id = `${prefix}-p${i++}`
    ids.push(id)
    // One tile the size of the shape's box, holding the engine's marks for it —
    // the same geometry every other painter draws.
    const box = c.kind === 'rect' ? c.rect : boundsOf(c.kind === 'polygon' ? c.points : [])
    if (p.kind === 'image' && p.image !== undefined) {
      // SVG cannot read an image's natural size, so a fill image tiles at
      // SVG_IMAGE_TILE (or the pattern's own width / spacingY when it has them);
      // an image decal keeps its grid geometry exactly.
      const tw = p.repeat === 'grid' ? p.spacing : p.width > 0.0 ? p.width : SVG_IMAGE_TILE
      const th = p.repeat === 'grid' ? p.spacingY ?? p.spacing : p.spacingY ?? tw
      const cells = p.repeat === 'grid' ? patternImageCells(p, box, 0.0, 0.0) : patternImageCells(p, box, tw, th)
      const imgs = cells.map((r) => `<image href="${esc(p.image ?? '')}" x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" preserveAspectRatio="xMidYMid meet"/>`).join('')
      parts.push(`<pattern id="${id}" x="0" y="0" width="${n(Math.max(box.x + box.w, 0.01))}" height="${n(Math.max(box.y + box.h, 0.01))}" patternUnits="userSpaceOnUse">${imgs}</pattern>`)
      continue
    }
    const marks = patternMarks(p, box).map(markSvg).join('')
    parts.push(`<pattern id="${id}" x="${n(box.x)}" y="${n(box.y)}" width="${n(Math.max(box.w, 0.01))}" height="${n(Math.max(box.h, 0.01))}" patternUnits="userSpaceOnUse"><g transform="translate(${n(-box.x)} ${n(-box.y)})">${marks}</g></pattern>`)
  }
  return { defs: parts.length === 0 ? '' : `<defs>${parts.join('')}</defs>`, ids }
}

function boundsOf(points: Pt[]): Rect {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  let x0 = points[0]!.x
  let y0 = points[0]!.y
  let x1 = x0
  let y1 = y0
  for (const q of points) {
    if (q.x < x0) x0 = q.x
    if (q.y < y0) y0 = q.y
    if (q.x > x1) x1 = q.x
    if (q.y > y1) y1 = q.y
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

function markSvg(m: DrawCmd): string {
  if (m.kind === 'line') return `<line x1="${n(m.from.x)}" y1="${n(m.from.y)}" x2="${n(m.to.x)}" y2="${n(m.to.y)}" stroke="${esc(m.stroke)}" stroke-width="${n(m.width)}"/>`
  if (m.kind === 'circle') return `<circle cx="${n(m.center.x)}" cy="${n(m.center.y)}" r="${n(m.radius)}" fill="${esc(m.fill)}"/>`
  if (m.kind === 'polygon') return `<polygon points="${m.points.map((q) => `${n(q.x)},${n(q.y)}`).join(' ')}" fill="${esc(m.fill)}"/>`
  return ''
}

/**
 * Serialize one command. Exported for backends that compose their own document.
 *
 * `gradientId` is the id `collectGradients` minted for THIS command; without
 * one, a gradient-bearing command falls back to its solid `fill`.
 */
export function svgCommand(c: DrawCmd, fontFamily: string, gradientId?: string, patternId?: string): string {
  const paint = (fill: string, grad: ChartGradient | undefined): string =>
    grad !== undefined && gradientId !== undefined && gradientId !== '' ? `url(#${gradientId})` : esc(fill)
  if (c.kind === 'rect') {
    const radii = cornerRadii(c.rect, c.corners)
    if (hasCorners(radii)) {
      const shape = `<path d="${roundedRectPath(c.rect.x, c.rect.y, c.rect.w, c.rect.h, radii)}"`
      return `${shape} fill="${paint(c.fill, c.grad)}"/>${c.pattern === undefined || !patternId ? '' : `${shape} fill="url(#${patternId})"/>`}`
    }
    const shape = `<rect x="${n(c.rect.x)}" y="${n(c.rect.y)}" width="${n(c.rect.w)}" height="${n(c.rect.h)}"`
    return `${shape} fill="${paint(c.fill, c.grad)}"/>${c.pattern === undefined || !patternId ? '' : `${shape} fill="url(#${patternId})"/>`}`
  }
  if (c.kind === 'line') {
    return `<line x1="${n(c.from.x)}" y1="${n(c.from.y)}" x2="${n(c.to.x)}" y2="${n(c.to.y)}" stroke="${esc(c.stroke)}" stroke-width="${n(c.width)}"${dashAttr(c.dash)}/>`
  }
  if (c.kind === 'polyline') {
    // Below two points there is no segment to stroke; emitting the element
    // anyway would put a stray dot at the vertex in some renderers.
    if (c.points.length < 2) return ''
    return `<polyline points="${pointsAttr(c.points)}" fill="none" stroke="${esc(c.stroke)}" stroke-width="${n(c.width)}"${dashAttr(c.dash)} stroke-linejoin="round" stroke-linecap="round"/>`
  }
  if (c.kind === 'polygon') {
    if (c.points.length < 3) return ''
    const shape = `<polygon points="${pointsAttr(c.points)}"`
    return `${shape} fill="${paint(c.fill, c.grad)}"/>${c.pattern === undefined || !patternId ? '' : `${shape} fill="url(#${patternId})"/>`}`
  }
  if (c.kind === 'circle') {
    return `<circle cx="${n(c.center.x)}" cy="${n(c.center.y)}" r="${n(c.radius)}" fill="${esc(c.fill)}"/>`
  }
  const rot = c.rotate ?? 0
  const transform = rot === 0 ? '' : ` transform="rotate(${n(rot)} ${n(c.at.x)} ${n(c.at.y)})"`
  return `<text x="${n(c.at.x)}" y="${n(c.at.y)}" fill="${esc(c.fill)}" font-size="${n(c.size)}" font-family="${esc(fontFamily)}" text-anchor="${ANCHOR[c.align]}" dominant-baseline="${BASELINE[c.baseline]}"${transform}>${esc(c.text)}</text>`
}

/** Options for {@link renderSvg}. */
export interface SvgOptions {
  /** Font stack for every text command. Must match what `measure` assumed. */
  fontFamily?: string
  /**
   * Accessible name, emitted as `<title>` and `aria-label`.
   *
   * Without it the `<svg>` is an unlabelled graphic — announced as nothing at
   * all by a screen reader. Pair it with `describeChart` from `./a11y` for the
   * long form.
   */
  title?: string
  /** Long description, emitted as `<desc>` and referenced by `aria-describedby`. */
  description?: string
  /**
   * Make the chart scale with its container instead of fixing pixel sizes.
   *
   * Emits a `viewBox` with `width="100%"`, so the same string works both as a
   * fixed-size export and as a fluid element in a page.
   */
  responsive?: boolean
  /** Background fill. Omitted entirely when unset, leaving the svg transparent. */
  background?: string
  /** Prefix for the generated `<title>`/`<desc>` ids. Change it when embedding several charts. */
  idPrefix?: string
}

/**
 * Render a command list to a complete `<svg>` document string.
 *
 * The element is `role="img"` with its title as the accessible name: a chart is
 * a single graphic to assistive tech, not a tree of shapes to navigate. Every
 * individual `<rect>`/`<text>` is therefore left unlabelled on purpose — naming
 * them would make a screen reader read out several hundred nodes.
 */
export function renderSvg(
  cmds: DrawCmd[],
  width: Double,
  height: Double,
  options: SvgOptions = {},
): string {
  const fontFamily = options.fontFamily ?? 'system-ui, sans-serif'
  // Escaped like every other interpolated option. It was the ONE that was not,
  // eleven lines above `background`, which does go through `esc()` — so a
  // prefix of `a" onload="alert(1)` put a live handler on the root <svg>. The
  // manifest tells callers to vary it per chart, which is exactly where a
  // data-derived id comes from.
  const prefix = esc(options.idPrefix ?? 'pyreon-chart')
  const titleId = `${prefix}-title`
  const descId = `${prefix}-desc`

  const size = options.responsive
    ? `width="100%" viewBox="0 0 ${n(width)} ${n(height)}" preserveAspectRatio="xMidYMid meet"`
    : `width="${n(width)}" height="${n(height)}" viewBox="0 0 ${n(width)} ${n(height)}"`

  const labelled: string[] = []
  if (options.title !== undefined) labelled.push(`<title id="${titleId}">${esc(options.title)}</title>`)
  if (options.description !== undefined) {
    labelled.push(`<desc id="${descId}">${esc(options.description)}</desc>`)
  }

  const aria: string[] = ['role="img"']
  if (options.title !== undefined) aria.push(`aria-labelledby="${titleId}"`)
  if (options.description !== undefined) aria.push(`aria-describedby="${descId}"`)

  const gradients = collectGradients(cmds, prefix)
  const patterns = collectPatterns(cmds, prefix)
  const body: string[] = []
  if (gradients.defs !== '') body.push(gradients.defs)
  if (patterns.defs !== '') body.push(patterns.defs)
  if (options.background !== undefined) {
    body.push(`<rect x="0" y="0" width="${n(width)}" height="${n(height)}" fill="${esc(options.background)}"/>`)
  }
  for (let i = 0; i < cmds.length; i++) {
    const s = svgCommand(cmds[i]!, fontFamily, gradients.ids[i], patterns.ids[i])
    if (s !== '') body.push(s)
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" ${size} ${aria.join(' ')}>${labelled.join('')}${body.join('')}</svg>`
}

/**
 * A text measurement for environments with no font metrics.
 *
 * `computeLayout` needs label widths to size the gutters, and a server has no
 * canvas to ask. This APPROXIMATES: average glyph advance times character
 * count, with digits and punctuation narrower than letters. It is honest about
 * being an estimate — axis labels are short and the gutter has slack, so a few
 * percent of error moves nothing visible, but do NOT use it for tight text
 * layout, and prefer the real `canvasMeasure` whenever a context exists.
 *
 * The ratio is tuned for the system sans stacks; a condensed or monospaced font
 * wants its own factor via `avgRatio`.
 */
export function measureApprox(avgRatio: Double = 0.52): MeasureText {
  return (text, fontSize) => {
    let units = 0
    for (const ch of text) {
      // Digits and separators are noticeably narrower than letters in
      // proportional faces, and axis labels are mostly digits — treating them
      // as full-width overestimates the y-gutter on every numeric chart.
      units += ch >= '0' && ch <= '9' ? 0.9 : ch === '.' || ch === ',' || ch === ' ' ? 0.45 : 1
    }
    return units * fontSize * avgRatio
  }
}
