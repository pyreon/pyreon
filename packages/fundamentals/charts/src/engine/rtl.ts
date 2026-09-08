// Right-to-left charts — one mirror, every family.
//
// RTL is expressed as a MIRROR of the finished draw list about the canvas's
// vertical centreline, not as a flag threaded through layout and every mark.
// That choice is the whole design, and it is worth stating why:
//
//   * A chart's right-to-left form IS its mirror image. Bands run from the
//     right, the value axis moves to the right gutter, the legend's swatch
//     sits right of its label, a line reads from the right. Mirroring the
//     geometry produces all of that at once, because they are the same fact.
//   * Mirroring about the CANVAS centreline (`x' = width - x`), not the plot
//     centreline, is what swaps the GUTTERS: a measured left gutter lands as
//     a right gutter of the same width, and the slim right padding becomes
//     slim left padding. So no layout code changes at all — `computeLayout`
//     keeps sizing the value-label gutter exactly as it does today.
//   * It applies to all twenty families rather than to the cartesian one. A
//     per-mark RTL flag would have to be honoured by every family separately,
//     and the ones that forgot would silently ignore it — the
//     typed-but-unimplemented shape this repo gates against.
//
// The one thing a mirror must NOT do is reverse text. Mirroring places a label
// at its mirrored position and leaves the string alone, which is correct:
// laying a chart out right-to-left does not reverse "Revenue" or "1.2M". What
// does flip is the ANCHOR — a label that hung off the left of its tick must
// hang off the right — and a rotated label's angle, which mirrors with it.
//
// The native twin is `pyreonMirrorCmds` in the Swift and Kotlin runtimes. It
// is hand-written per target for the same reason `pyreonShiftCmds` is: the
// draw command is a discriminated union in TypeScript and a flat struct with
// optional fields on native, so the switch below has no lowering. The two are
// kept honest by `mirror-parity.test.ts`, which runs the same commands
// through both and compares.

import type { ChartGradient, DrawCmd, Double, Pt } from './types'

/** Mirror one x coordinate about the canvas's vertical centreline. */
export function mirrorX(x: Double, width: Double): Double {
  return width - x
}

/** Mirror a point's x, leaving y alone. */
export function mirrorPoint(p: Pt, width: Double): Pt {
  return { x: mirrorX(p.x, width), y: p.y }
}

function mirrorGrad(g: ChartGradient | undefined, width: Double): ChartGradient | undefined {
  if (g === undefined) return undefined
  return { from: mirrorPoint(g.from, width), to: mirrorPoint(g.to, width), stops: g.stops }
}

/**
 * Corner radii mirror left-to-right: `[tl, tr, br, bl]` becomes
 * `[tr, tl, bl, br]`. Without this a bar rounded at the top of its growth
 * direction is rounded on the wrong side once mirrored — visible on exactly
 * the rounded-bar charts that made corners worth having.
 */
function mirrorCorners(c: Double[] | undefined): Double[] | undefined {
  if (c === undefined || c.length !== 4) return c
  return [c[1]!, c[0]!, c[3]!, c[2]!]
}

function flipAlign(a: 'start' | 'middle' | 'end'): 'start' | 'middle' | 'end' {
  return a === 'start' ? 'end' : a === 'end' ? 'start' : 'middle'
}

/**
 * Mirror a draw list about `width / 2`.
 *
 * Applying it twice is the identity (up to floating point), which is the
 * property its test leans on: a mirror that loses information somewhere shows
 * up as a round trip that does not come back.
 */
export function mirrorCmds(cmds: DrawCmd[], width: Double): DrawCmd[] {
  return cmds.map((c): DrawCmd => {
    switch (c.kind) {
      case 'rect':
        // The rect's own x is its LEFT edge, so the mirrored left edge is the
        // mirror of its RIGHT edge — mirroring `x` alone would shift every
        // rect by its own width.
        return {
          ...c,
          rect: { ...c.rect, x: mirrorX(c.rect.x + c.rect.w, width) },
          corners: mirrorCorners(c.corners),
          grad: mirrorGrad(c.grad, width),
        }
      case 'line':
        return { ...c, from: mirrorPoint(c.from, width), to: mirrorPoint(c.to, width) }
      case 'polyline':
        return { ...c, points: c.points.map((p) => mirrorPoint(p, width)) }
      case 'polygon':
        return { ...c, points: c.points.map((p) => mirrorPoint(p, width)), grad: mirrorGrad(c.grad, width) }
      case 'circle':
        return { ...c, center: mirrorPoint(c.center, width) }
      case 'text':
        return {
          ...c,
          at: mirrorPoint(c.at, width),
          align: flipAlign(c.align),
          // A slanted label mirrors with the chart, or it slants away from the
          // tick it belongs to.
          ...(c.rotate === undefined ? {} : { rotate: -c.rotate }),
        }
    }
  })
}
