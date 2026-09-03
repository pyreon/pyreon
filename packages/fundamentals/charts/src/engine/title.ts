// Title block — ECharts' `title` component, engine-shaped.
//
// A pure layout: the host reserves the returned height (the same contract
// the legend uses) and draws the commands. Kept out of `renderChart` so a
// chart in a card whose heading is the card's own never pays for it.

import type { DrawCmd, Double, Rect } from './types'

export interface TitleOptions {
  fontSize: Double
  color: string
  /** Sub-title size and colour; defaults derive from the title's. */
  subtitleSize?: Double | undefined
  subtitleColor?: string | undefined
  /** Horizontal alignment inside the box. */
  align?: 'start' | 'middle' | 'end' | undefined
  /** Space below the block — what separates it from the plot. */
  gap?: Double | undefined
}

export interface TitleLayout {
  cmds: DrawCmd[]
  /** Space consumed, including the trailing gap. */
  height: Double
}

/**
 * Lay out a title and optional sub-title at the top of `box`.
 *
 * Height is returned rather than assumed for the same reason the legend's
 * is: a sub-title may or may not be present, and the host must shrink the
 * plot by exactly what was drawn.
 */
export function renderTitle(
  text: string,
  subtitle: string | undefined,
  box: Rect,
  opts: TitleOptions,
): TitleLayout {
  const cmds: DrawCmd[] = []
  if (text === '' && (subtitle === undefined || subtitle === '')) return { cmds, height: 0.0 }
  const align = opts.align ?? 'start'
  const gap = opts.gap ?? 8.0
  const subSize = opts.subtitleSize ?? opts.fontSize * 0.8
  const subColor = opts.subtitleColor ?? opts.color
  const x = align === 'start' ? box.x : align === 'end' ? box.x + box.w : box.x + box.w / 2.0
  let y = box.y
  if (text !== '') {
    cmds.push({ kind: 'text', text, at: { x, y }, fill: opts.color, size: opts.fontSize, align, baseline: 'top' })
    y = y + opts.fontSize
  }
  if (subtitle !== undefined && subtitle !== '') {
    if (text !== '') y = y + gap / 2.0
    cmds.push({ kind: 'text', text: subtitle, at: { x, y }, fill: subColor, size: subSize, align, baseline: 'top' })
    y = y + subSize
  }
  return { cmds, height: y - box.y + gap }
}
