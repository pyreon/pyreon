/**
 * ECharts' legend on an option chart: which entries it shows (`legend.data`),
 * which start off (`legend.selected`), how a click toggles them
 * (`legend.selectedMode`), and what a hidden entry does to the series.
 *
 * Everything is keyed by NAME, as ECharts keys it: an entry toggles every
 * series of that name.
 */
import { renderLegend } from './legend'
import type { LegendEntry } from './legend'
import type { DrawCmd, Rect } from './types'
import { hideHiddenSeries } from './legend-toggle'
import type { Series } from './render'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** ECharts' `legend.selectedMode`: toggle freely, keep one on, or clicks do nothing. */
export type LegendSelectedMode = 'multiple' | 'single' | false

export interface OptionLegend {
  entries: LegendEntry[]
  layout: OptionLegendLayout
  /** The toggle behaviour a click has. */
  selectedMode: LegendSelectedMode
  /** The names `legend.selected` turns off. */
  hidden: string[]
}

/** The option's legend over the compiled series, or null when it shows none. */
export function readOptionLegend(raw: unknown, series: Series[]): OptionLegend | null {
  const legend = Array.isArray(raw) ? raw[0] : raw
  if (raw === undefined || (isObj(legend) && legend['show'] === false)) return null
  const l = isObj(legend) ? legend : {}
  const colorOf = new Map<string, string>()
  for (const s of series) if (!colorOf.has(s.label)) colorOf.set(s.label, s.color)
  // `legend.data` picks and orders the entries; names with no series are skipped (no swatch to show).
  const names = Array.isArray(l['data'])
    ? (l['data'] as unknown[]).map((d) => (typeof d === 'string' ? d : isObj(d) && typeof d['name'] === 'string' ? (d['name'] as string) : '')).filter((n) => colorOf.has(n))
    : [...colorOf.keys()]
  const sm = l['selectedMode']
  const selectedMode: LegendSelectedMode = sm === false ? false : sm === 'single' ? 'single' : 'multiple'
  const sel = isObj(l['selected']) ? l['selected'] : {}
  let hidden = names.filter((n) => sel[n] === false)
  // 'single' keeps exactly one entry on: the first the option leaves on.
  if (selectedMode === 'single') {
    const on = names.find((n) => !hidden.includes(n)) ?? names[0]
    hidden = names.filter((n) => n !== on)
  }
  return { entries: [...new Set(names)].map((label) => ({ label, color: colorOf.get(label)! })), layout: readLegendLayout(l), selectedMode, hidden }
}

/** The hidden set after a click on entry `name`. */
export function legendClick(hidden: string[], name: string, names: string[], mode: LegendSelectedMode): string[] {
  if (mode === false) return hidden
  if (mode === 'single') return names.filter((n) => n !== name)
  return hidden.includes(name) ? hidden.filter((n) => n !== name) : [...hidden, name]
}

/** The series with every series of a hidden name emptied (it keeps its slot and colour), and the entries muted to match. */
export function applyLegendHidden(series: Series[], entries: LegendEntry[], hidden: string[]): { series: Series[]; entries: LegendEntry[] } {
  if (hidden.length === 0) return { series, entries }
  const idx: number[] = []
  series.forEach((s, i) => {
    if (hidden.includes(s.label)) idx.push(i)
  })
  return { series: hideHiddenSeries(series, idx), entries: entries.map((e) => (hidden.includes(e.label) ? { ...e, muted: true } : e)) }
}

/** Where and how an option legend draws. Positions are ECharts' keywords, pixels or percents. */
export interface OptionLegendLayout {
  orient: 'horizontal' | 'vertical'
  left: string | number | undefined
  right: string | number | undefined
  top: string | number | undefined
  bottom: string | number | undefined
  itemGap: number | undefined
  fontSize: number | undefined
  color: string | undefined
  /** A `{name}` template or a function of the name. */
  formatter: string | ((name: string) => unknown) | undefined
}

const pos = (v: unknown): string | number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' ? v : undefined)

/** Read the legend's layout keys off the option legend object. */
export function readLegendLayout(l: Obj): OptionLegendLayout {
  const ts = isObj(l['textStyle']) ? l['textStyle'] : {}
  const f = l['formatter']
  return {
    orient: l['orient'] === 'vertical' ? 'vertical' : 'horizontal',
    left: pos(l['left']),
    right: pos(l['right']),
    top: pos(l['top']),
    bottom: pos(l['bottom']),
    itemGap: typeof l['itemGap'] === 'number' ? (l['itemGap'] as number) : undefined,
    fontSize: typeof ts['fontSize'] === 'number' ? (ts['fontSize'] as number) : undefined,
    color: typeof ts['color'] === 'string' ? (ts['color'] as string) : undefined,
    formatter: typeof f === 'string' || typeof f === 'function' ? (f as string | ((name: string) => unknown)) : undefined,
  }
}

/** An entry's shown text, per the legend's `formatter`. */
export function legendText(name: string, formatter: OptionLegendLayout['formatter']): string {
  if (formatter === undefined) return name
  if (typeof formatter === 'function') return String(formatter(name) ?? '')
  return formatter.split('{name}').join(name)
}

/** A position keyword / pixels / percent along `extent` for a block of `size`, or undefined. */
function place(v: string | number | undefined, extent: number, size: number, near: string, mid: string, far: string): number | undefined {
  if (v === undefined) return undefined
  if (v === near) return 0
  if (v === mid) return (extent - size) / 2
  if (v === far) return extent - size
  if (typeof v === 'number') return v
  const n = Number.parseFloat(v)
  if (!Number.isFinite(n)) return undefined
  return v.trim().endsWith('%') ? (n / 100) * extent : n
}

/** The side of the chart a placed legend sits on. */
export type LegendSide = 'top' | 'bottom' | 'left' | 'right' | 'over'

/**
 * Lay the legend out and place it as ECharts does: horizontal and centred at
 * the top by default; `left`/`right` and `top`/`bottom` move it; `orient:
 * 'vertical'` stacks the entries. Returns the commands, the entries' hit boxes
 * (in the same space), the block's rect and the side it sits on.
 */
export function placeOptionLegend(
  entries: LegendEntry[],
  layout: OptionLegendLayout | undefined,
  box: { x: number; y: number; w: number; h: number },
  theme: { fontSize: number; label: string },
  measure: (text: string, size: number) => number,
): { cmds: DrawCmd[]; boxes: Rect[]; rect: Rect; side: LegendSide } {
  const lay = layout ?? readLegendLayout({})
  const shown = entries.map((e) => ({ ...e, label: legendText(e.label, lay.formatter) }))
  const vertical = lay.orient === 'vertical'
  const l = renderLegend(shown, { x: 0, y: 0, w: box.w, h: box.h }, { fontSize: lay.fontSize ?? theme.fontSize, labelColor: lay.color ?? theme.label, swatch: 10, gap: lay.itemGap ?? 12, orientation: vertical ? 'vertical' : 'horizontal' }, measure)
  let bw = 0
  for (const b of l.boxes) if (b.w > 0 && b.x + b.w > bw) bw = b.x + b.w
  const bh = l.height
  const x = place(lay.left, box.w, bw, 'left', 'center', 'right') ?? (lay.right !== undefined ? box.w - bw - (place(lay.right, box.w, bw, 'right', 'center', 'left') ?? 0) : (box.w - bw) / 2)
  const fromBottom = lay.top === undefined && lay.bottom !== undefined
  const yTop = place(lay.top, box.h, bh, 'top', 'middle', 'bottom')
  const y = yTop ?? (fromBottom ? box.h - bh - (place(lay.bottom, box.h, bh, 'bottom', 'middle', 'top') ?? 0) : 0)
  const dx = box.x + x
  const dy = box.y + y
  const side: LegendSide = vertical
    ? x + bw / 2 > box.w / 2 ? 'right' : 'left'
    : y + bh / 2 > box.h / 2 ? 'bottom' : y === 0 ? 'top' : 'over'
  return {
    cmds: l.cmds.map((c) => translate(c, dx, dy)),
    boxes: l.boxes.map((b) => (b.w > 0 ? { ...b, x: b.x + dx, y: b.y + dy } : b)),
    rect: { x: dx, y: dy, w: bw, h: bh },
    side,
  }
}

/** A command moved by (dx, dy). */
function translate(c: DrawCmd, dx: number, dy: number): DrawCmd {
  const pt = (p: { x: number; y: number }) => ({ x: p.x + dx, y: p.y + dy })
  switch (c.kind) {
    case 'rect':
      return { ...c, rect: { ...c.rect, x: c.rect.x + dx, y: c.rect.y + dy } }
    case 'line':
      return { ...c, from: pt(c.from), to: pt(c.to) }
    case 'polyline':
    case 'polygon':
      return { ...c, points: c.points.map(pt) }
    case 'circle':
      return { ...c, center: pt(c.center) }
    default:
      return { ...c, at: pt(c.at) }
  }
}
