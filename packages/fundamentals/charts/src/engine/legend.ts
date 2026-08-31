// Legends.

import type { DrawCmd, Double, Rect } from './types'

export interface LegendEntry {
  label: string
  color: string
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
  if (entries.length === 0) return { cmds, height: 0.0 }

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

    cmds.push({
      kind: 'rect',
      rect: { x, y: y + (rowH - opts.gap - opts.swatch) / 2.0, w: opts.swatch, h: opts.swatch },
      fill: e.color,
    })
    cmds.push({
      kind: 'text',
      text: e.label,
      at: { x: x + opts.swatch + 4.0, y: y + (rowH - opts.gap) / 2.0 },
      fill: opts.labelColor,
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
  return { cmds, height }
}
