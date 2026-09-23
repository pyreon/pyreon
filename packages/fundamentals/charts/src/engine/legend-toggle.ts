// Legend interaction — ECharts' legend `selected` toggling and the pager,
// engine-shaped: which series a tap hides, what a hidden series contributes,
// and where the pager arrows are. The web host, iOS and Android hold the
// hidden set (and the page) as state and ask these the same questions, so a
// legend tap means one thing on every target.

import type { LegendEntry, LegendPager } from './legend'
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
 * The legend a chart shows for its series: ONE entry per distinct label, in
 * first-appearance order, in that series' colour — ECharts' rule, where the
 * legend lists series NAMES and an area and a line sharing one name are one
 * entry. An entry is muted only when every series under it is hidden.
 *
 * Before this every series drew its own entry, so the idiomatic "an area under
 * a line, both labelled Revenue" drew two identical Revenue swatches.
 */
export function legendEntriesGrouped(labels: string[], colors: string[], hidden: number[]): LegendEntry[] {
  const out: LegendEntry[] = []
  const seen: string[] = []
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]!
    let known = false
    for (let k = 0; k < seen.length; k++) {
      if (seen[k] === label) known = true
    }
    if (known) continue
    seen.push(label)
    let allHidden = true
    for (let j = 0; j < labels.length; j++) {
      if (labels[j] === label && !isHiddenSeries(hidden, j)) allHidden = false
    }
    out.push({ label, color: i < colors.length ? colors[i]! : '#999999', muted: allHidden })
  }
  return out
}

/**
 * A tap on grouped legend entry `entry` (see `legendEntriesGrouped`): every
 * series under that label is hidden when any of them shows, and shown again
 * when all are hidden — a NEW array; the host keeps the old one as state.
 */
export function legendToggleGroup(hidden: number[], labels: string[], entry: number): number[] {
  // The label at entry index `entry`, counting distinct labels in order.
  const seen: string[] = []
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]!
    let known = false
    for (let k = 0; k < seen.length; k++) {
      if (seen[k] === label) known = true
    }
    if (!known) seen.push(label)
  }
  if (entry < 0 || entry >= seen.length) return hidden
  const target = seen[entry]!
  let anyShown = false
  for (let j = 0; j < labels.length; j++) {
    if (labels[j] === target && !isHiddenSeries(hidden, j)) anyShown = true
  }
  const out: number[] = []
  for (let k = 0; k < hidden.length; k++) {
    const h = hidden[k]!
    const inGroup = h >= 0 && h < labels.length && labels[h] === target
    if (!inGroup) out.push(h)
  }
  if (anyShown) {
    for (let j = 0; j < labels.length; j++) {
      if (labels[j] === target) out.push(j)
    }
  }
  return out
}

/**
 * Apply a pick to the pinned selection (ECharts `selectedMode`) — a NEW array;
 * the host keeps the old one as state.
 *
 * `'single'` keeps at most one datum and a re-pick CLEARS it; `'multiple'`
 * toggles membership. A miss (`global < 0`) leaves the selection alone, because
 * clearing is an explicit `unselect` / `restore` rather than a stray tap.
 *
 * It lives beside `legendToggle` for the same reason that one does: the web
 * host, iOS and Android all hold the selection as state and must agree on what
 * a pick means. It was inline in `<Chart>`'s `pickDatum` until the native hosts
 * needed it, and re-deriving it in two emitters is how the three targets would
 * come to disagree about what a second tap does.
 */
export function pinSelection(selected: number[], global: number, multiple: boolean): number[] {
  if (global < 0) return selected
  let has = false
  for (let k = 0; k < selected.length; k++) {
    if (selected[k] === global) has = true
  }
  if (!multiple) {
    const one: number[] = []
    if (!has) one.push(global)
    return one
  }
  const out: number[] = []
  for (let k = 0; k < selected.length; k++) {
    const s = selected[k]!
    if (s !== global) out.push(s)
  }
  if (!has) out.push(global)
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
