// Legend interaction — ECharts' legend `selected` toggling and the pager,
// engine-shaped: which series a tap hides, what a hidden series contributes,
// and where the pager arrows are. The web host, iOS and Android hold the
// hidden set (and the page) as state and ask these the same questions, so a
// legend tap means one thing on every target.

import type { LegendPager } from './legend'
import type { Series } from './render'
import type { Double, Rect } from './types'

/** Whether series `i` is in the hidden set. */
export function isHiddenSeries(hidden: number[], i: number): boolean {
  for (let k = 0; k < hidden.length; k++) {
    if (hidden[k] === i) return true
  }
  return false
}

/** Toggle series `i` in the hidden set — a NEW array; the host keeps the old one as state. */
export function legendToggle(hidden: number[], i: number): number[] {
  const out: number[] = []
  let found = false
  for (let k = 0; k < hidden.length; k++) {
    const h = hidden[k]!
    if (h === i) {
      found = true
    } else {
      out.push(h)
    }
  }
  if (!found) out.push(i)
  return out
}

/**
 * Apply the toggle to resolved series.
 *
 * A hidden series keeps its SLOT — colors, labels and tooltip columns stay
 * index-aligned — but contributes no geometry and no domain. Stacked and
 * grouped series are zeroed instead of emptied: their layouts walk every
 * series at every index together, and an empty sibling would misalign them.
 */
export function hideHiddenSeries(series: Series[], hidden: number[]): Series[] {
  if (hidden.length === 0) return series
  const out: Series[] = []
  for (let i = 0; i < series.length; i++) {
    const s = series[i]!
    if (isHiddenSeries(hidden, i)) {
      const zeroed: Double[] = []
      if (s.kind === 'stacked' || s.kind === 'grouped') {
        for (let k = 0; k < s.values.length; k++) zeroed.push(0.0)
      }
      out.push({
        kind: s.kind,
        values: zeroed,
        color: s.color,
        width: s.width,
        radius: s.radius,
        label: s.label,
        curve: s.curve,
        showValues: false,
        axis: s.axis,
        effect: s.effect,
        symbol: s.symbol,
        symbolRepeat: s.symbolRepeat,
      })
    } else {
      out.push(s)
    }
  }
  return out
}

/** The legend entry under (x, y), or -1. */
export function legendHitIndex(boxes: Rect[], x: Double, y: Double): number {
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]!
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return i
  }
  return -1
}

/** The page delta a tap on the pager asks for: -1 on a live ‹, +1 on a live ›, else 0. */
export function pagerHit(pager: LegendPager, x: Double, y: Double): Double {
  const p = pager.prev
  if (pager.hasPrev && x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return -1.0
  const n = pager.next
  if (pager.hasNext && x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h) return 1.0
  return 0.0
}
