/**
 * ECharts' `title` component on an option chart: the text and subtext, where
 * they sit across the chart (`left` / `right` / `textAlign`), their look
 * (`textStyle` / `subtextStyle`) and the gap between them (`itemGap`).
 *
 * With none of those keys the output is the facade's long-standing default: a
 * left-aligned title a step larger than the theme's font, the subtext under it.
 */
import type { ChartTheme } from './render'
import type { DrawCmd, Double } from './types'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

export interface OptionTitle {
  text: string
  subtext: string | undefined
  /** Where the block's anchor sits: a keyword, pixels, or a percent of the width. */
  left: string | number | undefined
  right: string | number | undefined
  /** How the text hangs off its anchor. */
  textAlign: 'left' | 'center' | 'right' | undefined
  color: string | undefined
  fontSize: Double | undefined
  subColor: string | undefined
  subFontSize: Double | undefined
  /** Pixels between the title and the subtext. */
  itemGap: Double | undefined
}

/** The option's title, or null when it has no text. */
export function readOptionTitle(raw: unknown): OptionTitle | null {
  if (!isObj(raw) || typeof raw['text'] !== 'string' || raw['show'] === false) return null
  const ts = isObj(raw['textStyle']) ? raw['textStyle'] : {}
  const ss = isObj(raw['subtextStyle']) ? raw['subtextStyle'] : {}
  const pos = (v: unknown): string | number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' ? v : undefined)
  const ta = raw['textAlign']
  return {
    text: raw['text'] as string,
    subtext: str(raw['subtext']),
    left: pos(raw['left']),
    right: pos(raw['right']),
    textAlign: ta === 'left' || ta === 'center' || ta === 'right' ? ta : undefined,
    color: str(ts['color']),
    fontSize: num(ts['fontSize']),
    subColor: str(ss['color']),
    subFontSize: num(ss['fontSize']),
    itemGap: num(raw['itemGap']),
  }
}

/** A `left` / `right` length in pixels. */
const length = (v: string | number, width: Double): Double => {
  if (typeof v === 'number') return v
  if (v.endsWith('%')) return (Number.parseFloat(v) / 100.0) * width
  const n = Number.parseFloat(v)
  return Number.isFinite(n) ? n : 0.0
}

/** The title's commands across a chart `width`, and the height it takes off the top. */
export function optionTitleCommands(title: OptionTitle, width: Double, t: ChartTheme): { cmds: DrawCmd[]; height: Double } {
  // Where the anchor is, and which way the text hangs by default (ECharts: off the side it is pinned to).
  let x = 0.0
  let hang: 'start' | 'middle' | 'end' = 'start'
  if (title.left === 'center') {
    x = width / 2.0
    hang = 'middle'
  } else if (title.left === 'right') {
    x = width
    hang = 'end'
  } else if (title.left !== undefined && title.left !== 'left') {
    x = length(title.left, width)
  } else if (title.left === undefined && title.right !== undefined) {
    x = width - length(title.right, width)
    hang = 'end'
  }
  const align = title.textAlign === 'center' ? 'middle' : title.textAlign === 'right' ? 'end' : title.textAlign === 'left' ? 'start' : hang
  const size = title.fontSize ?? t.fontSize + 4.0
  const subSize = title.subFontSize ?? t.fontSize
  const cmds: DrawCmd[] = [{ kind: 'text', text: title.text, at: { x, y: 0.0 }, fill: title.color ?? t.label, size, align, baseline: 'top' }]
  let h = size
  if (title.subtext !== undefined) {
    const gap = title.itemGap ?? 2.0
    cmds.push({ kind: 'text', text: title.subtext, at: { x, y: h + gap }, fill: title.subColor ?? t.label, size: subSize, align, baseline: 'top' })
    h = h + gap + subSize
  }
  return { cmds, height: h + 8.0 }
}
