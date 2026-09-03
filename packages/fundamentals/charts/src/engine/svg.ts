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
import type { DrawCmd, Double, MeasureText, Pt } from './types'

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

/** Serialize one command. Exported for backends that compose their own document. */
export function svgCommand(c: DrawCmd, fontFamily: string): string {
  if (c.kind === 'rect') {
    const radii = cornerRadii(c.rect, c.corners)
    if (hasCorners(radii)) {
      return `<path d="${roundedRectPath(c.rect.x, c.rect.y, c.rect.w, c.rect.h, radii)}" fill="${esc(c.fill)}"/>`
    }
    return `<rect x="${n(c.rect.x)}" y="${n(c.rect.y)}" width="${n(c.rect.w)}" height="${n(c.rect.h)}" fill="${esc(c.fill)}"/>`
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
    return `<polygon points="${pointsAttr(c.points)}" fill="${esc(c.fill)}"/>`
  }
  if (c.kind === 'circle') {
    return `<circle cx="${n(c.center.x)}" cy="${n(c.center.y)}" r="${n(c.radius)}" fill="${esc(c.fill)}"/>`
  }
  return `<text x="${n(c.at.x)}" y="${n(c.at.y)}" fill="${esc(c.fill)}" font-size="${n(c.size)}" font-family="${esc(fontFamily)}" text-anchor="${ANCHOR[c.align]}" dominant-baseline="${BASELINE[c.baseline]}">${esc(c.text)}</text>`
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

  const body: string[] = []
  if (options.background !== undefined) {
    body.push(`<rect x="0" y="0" width="${n(width)}" height="${n(height)}" fill="${esc(options.background)}"/>`)
  }
  for (const c of cmds) {
    const s = svgCommand(c, fontFamily)
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
