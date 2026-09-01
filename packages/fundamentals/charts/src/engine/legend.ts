// Legends.

import { withAlpha } from './radar'
import type { DrawCmd, Double, Rect } from './types'

export interface LegendEntry {
  label: string
  color: string
  /** Render dimmed — a toggled-off series that can be toggled back on. */
  muted?: boolean | undefined
}

export interface LegendOptions {
  fontSize: Double
  labelColor: string
  swatch: Double
  gap: Double
  /** Horizontal wraps onto rows; vertical is one entry per line. */
  orientation: 'horizontal' | 'vertical'
  /**
   * Cap the rows shown at once and PAGE the rest (ECharts' scroll legend).
   *
   * A legend of forty series must not eat the plot; capped, it shows
   * `maxRows` rows and a pager, and the host flips `page`. Absent means
   * unbounded — the wrap-everything behavior.
   */
  maxRows?: Double | undefined
  /** The page to show when capped, 0-based; clamped into range. */
  page?: Double | undefined
}

/** Pager geometry when the legend is capped and overflows. */
export interface LegendPager {
  page: number
  pages: number
  /** Hit rects for the arrows; null at the respective end. */
  prev: Rect | null
  next: Rect | null
}

export interface LegendLayout {
  cmds: DrawCmd[]
  /** Space consumed, so the caller can shrink the plot by exactly this much. */
  height: Double
  /**
   * One hit rect per entry, index-aligned with the input — what a click
   * toggles. Computed here because only the layout knows where wrapping put
   * each entry; a caller reconstructing them would re-implement the wrap.
   */
  boxes: Rect[]
  /**
   * Present only when `maxRows` capped an overflowing legend. Entries on
   * other pages are NOT drawn and get an EMPTY hit rect (w = -1, which no
   * point can satisfy) so `boxes` stays index-aligned with the input.
   */
  pager?: LegendPager | undefined
}

/**
 * Lay out and draw a legend, returning the height it used.
 *
 * The height is returned rather than assumed because a horizontal legend WRAPS:
 * the same entries take one row on a wide chart and three on a narrow one, and
 * a caller that reserved a fixed strip would either clip the legend or leave a
 * gap. Measurement is supplied by the host for the same reason axis layout
 * needs it.
 */
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
  const capped = opts.maxRows !== undefined && maxRows >= 1.0

  // Row assignment. Two passes when capped: the first learns whether the
  // legend overflows at all; if it does, the second re-wraps at a width
  // that reserves room for the pager, so the last visible row never runs
  // under the arrows.
  const assign = (wrapW: Double): { row: number[]; xs: Double[]; rows: number } => {
    const row: number[] = []
    const xs: Double[] = []
    let x = box.x
    let r = 0
    for (const e of entries) {
      const entryW = opts.swatch + 4.0 + measure(e.label, opts.fontSize) + opts.gap
      if (opts.orientation === 'horizontal' && x + entryW > box.x + wrapW && x > box.x) {
        x = box.x
        r = r + 1
      }
      row.push(r)
      xs.push(x)
      if (opts.orientation === 'horizontal') x = x + entryW
      else r = r + 1
    }
    const rows = opts.orientation === 'horizontal' ? r + 1 : entries.length
    return { row, xs, rows }
  }

  let plan = assign(box.w)
  let overflow = capped && plan.rows > maxRows
  if (overflow && opts.orientation === 'horizontal') {
    plan = assign(Math.max(opts.swatch + 4.0, box.w - pagerW))
    overflow = plan.rows > maxRows
  }

  const pages = overflow ? Math.ceil(plan.rows / maxRows) : 1
  const rawPage = opts.page ?? 0.0
  const page = overflow ? Math.max(0, Math.min(pages - 1, Math.floor(rawPage))) : 0
  const firstRow = overflow ? page * maxRows : 0
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
  // that cannot move are drawn muted and get no hit rect.
  const py = box.y + (visibleRows - 1) * rowH
  const arrowW = opts.fontSize
  const right = box.x + box.w
  const prevX = right - pagerW
  const nextX = right - arrowW
  const canPrev = page > 0
  const canNext = page < pages - 1
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
    text: `${page + 1}/${pages}`,
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
    prev: canPrev ? { x: prevX, y: py, w: arrowW, h: rowH - opts.gap } : null,
    next: canNext ? { x: nextX, y: py, w: arrowW, h: rowH - opts.gap } : null,
  }
  return { cmds, height, boxes, pager }
}
