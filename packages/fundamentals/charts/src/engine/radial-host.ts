// Canvas-host sizing shared by the radial components.
//
// Extracted from `PieChart.tsx` when `<RadarChart>` arrived — three copies of
// a width rule is how the pie/gauge pair missed the pinned-width fix the plot
// already had (#3161), so the rule now has one home.

import type { Double } from './types'

/**
 * The width the next draw should use.
 *
 * Measures the PARENT, not the canvas. `prepareCanvas` writes an inline
 * `canvas.style.width`, so reading `el.clientWidth` reports back whatever the
 * FIRST draw chose and the chart is pinned at that size forever — 300px inside
 * a 430px column, with nothing in the DOM looking wrong. (The old expression
 * was `props.width ?? el.clientWidth ?? 300`, whose `?? 300` was also dead:
 * `clientWidth` is always a number, so the fallback could never be reached.)
 *
 * Identical in shape to `<PlotChart>`'s `drawWidth`, whose comment documents
 * this exact failure — the radial family simply never got it.
 */
export function radialWidth(
  el: HTMLCanvasElement,
  explicit: Double | undefined,
  fallback: Double,
): Double {
  if (explicit !== undefined) return explicit
  const box = el.parentElement
  const w = box === null ? 0 : box.clientWidth
  return w > 0 ? w : fallback
}

/**
 * Redraw when the container resizes. Returns the observer so the caller can
 * disconnect it.
 *
 * Guarded against the feedback loop the draw itself causes: a draw resizes the
 * canvas, which fires the observer, which would draw again forever. Redraw only
 * when the width the NEXT draw would use differs from the backing store already
 * on the canvas — the same guard `<PlotChart>` uses.
 */
export function observeWidth(
  el: HTMLCanvasElement,
  widthFor: () => Double,
  redraw: () => void,
): ResizeObserver | null {
  const box = el.parentElement
  if (box === null || typeof ResizeObserver === 'undefined') return null
  const ro = new ResizeObserver(() => {
    const dpr = typeof globalThis.devicePixelRatio === 'number' ? globalThis.devicePixelRatio : 1
    if (Math.round(widthFor() * dpr) === el.width) return
    redraw()
  })
  ro.observe(box)
  return ro
}
