// Legends.
//
// Written in the native-crossing subset (see the engine README): the row
// assignment is a top-level function returning a named plan rather than a
// closure over the entries, counts are Doubles, the pager's arrow rects are
// plain values guarded by booleans, and a page label goes through `plain`
// so it reads "2/5" on every target.

import { plain } from './format'
import { withAlpha } from './radar'
import type { DrawCmd, Double, Rect } from './types'

export interface LegendEntry {
  label: string
  color: string
  /** Hidden-series marker: the swatch keeps its hue at an opacity that reads as off. */
  muted?: boolean | undefined
}

export interface LegendOptions {
  fontSize: Double
  labelColor: string
  swatch: Double
  gap: Double
  orientation: 'horizontal' | 'vertical'
  /** Cap the legend at this many rows and page the rest. */
  maxRows?: Double | undefined
  /** The page to show when capped (0-based, clamped). */
  page?: Double | undefined
}

export interface LegendPager {
  page: Double
  pages: Double
  /** Whether the ‹ arrow is live; `prev` is its hit rect when it is. */
  hasPrev: boolean
  prev: Rect
  /** Whether the › arrow is live; `next` is its hit rect when it is. */
  hasNext: boolean
  next: Rect
}

export interface LegendLayout {
  cmds: DrawCmd[]
  height: Double
  /** One hit rect per entry; a paged-out entry gets a negative-size rect. */
  boxes: Rect[]
  pager?: LegendPager | undefined
}

/** Row assignment: which row each entry lands on, its x, and the row count. */
export interface LegendPlan {
  row: Double[]
  xs: Double[]
  rows: Double
}

/**
 * Assign entries to rows for a given wrap width — two passes when capped:
 * the first learns whether the legend overflows at all; if it does, the
 * second re-wraps at a width that reserves room for the pager, so the last
 * visible row never runs under the arrows.
 */
export function legendPlan(
  entries: LegendEntry[],
  box: Rect,
  opts: LegendOptions,
  measure: (text: string, size: Double) => Double,
  wrapW: Double,
): LegendPlan {
  const row: Double[] = []
  const xs: Double[] = []
  let x = box.x
  let r = 0.0
  for (const e of entries) {
    const entryW = opts.swatch + 4.0 + measure(e.label, opts.fontSize) + opts.gap
    if (opts.orientation === 'horizontal' && x + entryW > box.x + wrapW && x > box.x) {
      x = box.x
      r = r + 1.0
    }
    row.push(r)
    xs.push(x)
    if (opts.orientation === 'horizontal') x = x + entryW
    else r = r + 1.0
  }
  let count = 0.0
  for (let i = 0; i < entries.length; i++) count = count + 1.0
  const rows = opts.orientation === 'horizontal' ? r + 1.0 : count
  return { row, xs, rows }
}

/** Smallest whole number ≥ v (a positive v), without Math.ceil — which has no native form. */
function ceilPositive(v: Double): Double {
  const f = Math.floor(v)
  return f < v ? f + 1.0 : f
}

export function renderLegend(
  entries: LegendEntry[],
  box: Rect,
  opts: LegendOptions,
  measure: (text: string, size: Double) => Double,
): LegendLayout {
  const cmds: DrawCmd[] = []
  const boxes: Rect[] = []
  if (entries.length === 0) return { cmds, height: 0.0, boxes }

  const rowH = Math.max(opts.swatch, opts.fontSize) + opts.gap
  const pagerW = opts.fontSize * 5.0 + opts.gap
  const maxRows = opts.maxRows ?? 0.0
  const capped = maxRows >= 1.0

  let plan = legendPlan(entries, box, opts, measure, box.w)
  let overflow = capped && plan.rows > maxRows
  if (overflow && opts.orientation === 'horizontal') {
    plan = legendPlan(entries, box, opts, measure, Math.max(opts.swatch + 4.0, box.w - pagerW))
    overflow = plan.rows > maxRows
  }

  const pages = overflow ? ceilPositive(plan.rows / maxRows) : 1.0
  const rawPage = opts.page ?? 0.0
  const page = overflow ? Math.max(0.0, Math.min(pages - 1.0, Math.floor(rawPage))) : 0.0
  const firstRow = overflow ? page * maxRows : 0.0
  const lastRow = overflow ? Math.min(plan.rows, firstRow + maxRows) : plan.rows

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!
    const r = plan.row[i]!
    if (r < firstRow || r >= lastRow) {
      boxes.push({ x: 0.0, y: 0.0, w: -1.0, h: -1.0 })
      continue
    }
    const x = plan.xs[i]!
    const y = box.y + (r - firstRow) * rowH
    const textW = measure(e.label, opts.fontSize)
    const entryW = opts.swatch + 4.0 + textW + opts.gap
    boxes.push({ x, y, w: entryW - opts.gap, h: rowH - opts.gap })
    cmds.push({
      kind: 'rect',
      rect: { x, y: y + (rowH - opts.gap - opts.swatch) / 2.0, w: opts.swatch, h: opts.swatch },
      // A muted swatch keeps its hue — the entry must still say WHICH series
      // it would bring back — at an opacity that reads as off.
      fill: e.muted === true ? withAlpha(e.color, 0.25) : e.color,
    })
    cmds.push({
      kind: 'text',
      text: e.label,
      at: { x: x + opts.swatch + 4.0, y: y + (rowH - opts.gap) / 2.0 },
      fill: e.muted === true ? withAlpha(opts.labelColor, 0.45) : opts.labelColor,
      size: opts.fontSize,
      align: 'start',
      baseline: 'middle',
    })
  }

  const visibleRows = lastRow - firstRow
  const height = visibleRows * rowH

  if (!overflow) return { cmds, height, boxes }

  // The pager sits right-aligned on the LAST visible row: "‹ 2/5 ›". Arrows
  // that cannot move are drawn muted and get no live hit rect.
  const py = box.y + (visibleRows - 1.0) * rowH
  const arrowW = opts.fontSize
  const right = box.x + box.w
  const prevX = right - pagerW
  const nextX = right - arrowW
  const canPrev = page > 0.0
  const canNext = page < pages - 1.0
  const mid = (rowH - opts.gap) / 2.0
  cmds.push({
    kind: 'text',
    text: '‹',
    at: { x: prevX + arrowW / 2.0, y: py + mid },
    fill: canPrev ? opts.labelColor : withAlpha(opts.labelColor, 0.35),
    size: opts.fontSize,
    align: 'middle',
    baseline: 'middle',
  })
  cmds.push({
    kind: 'text',
    text: `${plain(page + 1.0)}/${plain(pages)}`,
    at: { x: (prevX + arrowW + nextX) / 2.0, y: py + mid },
    fill: opts.labelColor,
    size: opts.fontSize,
    align: 'middle',
    baseline: 'middle',
  })
  cmds.push({
    kind: 'text',
    text: '›',
    at: { x: nextX + arrowW / 2.0, y: py + mid },
    fill: canNext ? opts.labelColor : withAlpha(opts.labelColor, 0.35),
    size: opts.fontSize,
    align: 'middle',
    baseline: 'middle',
  })
  const pager: LegendPager = {
    page,
    pages,
    hasPrev: canPrev,
    prev: { x: prevX, y: py, w: arrowW, h: rowH - opts.gap },
    hasNext: canNext,
    next: { x: nextX, y: py, w: arrowW, h: rowH - opts.gap },
  }
  return { cmds, height, boxes, pager }
}

/** Where the legend block sits relative to the plot. */
export type LegendPosition = 'top' | 'bottom' | 'left' | 'right'

/**
 * A placed legend: its commands, the INSETS it consumed on each side of the
 * area it was given, and the per-entry hit rects.
 *
 * Placement lives HERE, not in the host, because three targets have to agree
 * on it. The web host used to spell the four branches inline, so a native host
 * could either re-derive them or — what actually happened — draw every legend
 * at the top and warn that `legendPosition` does not lower. One function the
 * web host and both emitters call is the same argument `chrome.ts` already
 * won for legend ENTRIES and tooltips.
 */
export interface LegendPlacement {
  cmds: DrawCmd[]
  /** Space the legend took at the top of the area (0 unless `position` is 'top'). */
  top: Double
  bottom: Double
  left: Double
  right: Double
  /** One hit rect per entry; a paged-out entry gets a negative-size rect. */
  boxes: Rect[]
  pager?: LegendPager | undefined
}

/** The vertical legend's column width — the widest entry plus its swatch and gap. */
export function legendColumnWidth(entries: LegendEntry[], opts: LegendOptions, measure: (text: string, size: Double) => Double): Double {
  let w = 0.0
  for (const e of entries) {
    const ew = opts.swatch + 4.0 + measure(e.label, opts.fontSize) + opts.gap
    if (ew > w) w = ew
  }
  return w
}

/**
 * Lay the legend into one edge of `area` and report what it consumed.
 *
 * `opts.orientation` is IGNORED — the position decides it (a side legend is a
 * column, a top or bottom one wraps in rows), so a caller cannot ask for a
 * combination that lays out one way and measures another.
 */
export function placeLegend(
  entries: LegendEntry[],
  area: Rect,
  position: LegendPosition,
  opts: LegendOptions,
  measure: (text: string, size: Double) => Double,
): LegendPlacement {
  const empty: LegendPlacement = { cmds: [], top: 0.0, bottom: 0.0, left: 0.0, right: 0.0, boxes: [] }
  if (entries.length === 0) return empty
  const pad = 8.0
  if (position === 'left' || position === 'right') {
    const col = Math.min(legendColumnWidth(entries, opts, measure), area.w * 0.4)
    const lx = position === 'left' ? area.x + pad : area.x + area.w - col
    const vertical: LegendOptions = { ...opts, orientation: 'vertical' }
    const l = renderLegend(entries, { x: lx, y: area.y + pad, w: col, h: area.h }, vertical, measure)
    const inset = col + pad
    return {
      cmds: l.cmds,
      top: 0.0,
      bottom: 0.0,
      left: position === 'left' ? inset : 0.0,
      right: position === 'right' ? inset : 0.0,
      boxes: l.boxes,
      pager: l.pager,
    }
  }
  const horizontal: LegendOptions = { ...opts, orientation: 'horizontal' }
  const wrapW = area.w - pad * 2.0
  if (position === 'bottom') {
    // Its height decides where it sits, so plan it first, then place it.
    const rows = legendPlan(entries, { x: pad, y: 0.0, w: wrapW, h: area.h }, horizontal, measure, wrapW).rows
    const rowH = Math.max(10.0, opts.fontSize) + 12.0
    const lh = rows * rowH
    const l = renderLegend(entries, { x: area.x + pad, y: area.y + area.h - lh, w: wrapW, h: lh }, horizontal, measure)
    return { cmds: l.cmds, top: 0.0, bottom: l.height + pad, left: 0.0, right: 0.0, boxes: l.boxes, pager: l.pager }
  }
  const l = renderLegend(entries, { x: area.x + pad, y: area.y + pad, w: wrapW, h: area.h }, horizontal, measure)
  return { cmds: l.cmds, top: l.height + pad, bottom: 0.0, left: 0.0, right: 0.0, boxes: l.boxes, pager: l.pager }
}
