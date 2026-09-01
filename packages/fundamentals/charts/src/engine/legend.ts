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
  let x = box.x
  let y = box.y
  let rows = 1

  for (const e of entries) {
    const textW = measure(e.label, opts.fontSize)
    const entryW = opts.swatch + 4.0 + textW + opts.gap

    if (opts.orientation === 'horizontal' && x + entryW > box.x + box.w && x > box.x) {
      x = box.x
      y = y + rowH
      rows = rows + 1
    }

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

    if (opts.orientation === 'horizontal') x = x + entryW
    else {
      y = y + rowH
      rows = rows + 1
    }
  }

  const height = opts.orientation === 'horizontal' ? rows * rowH : entries.length * rowH
  return { cmds, height, boxes }
}
