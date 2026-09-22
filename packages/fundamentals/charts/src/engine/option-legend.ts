/**
 * ECharts' legend on an option chart: which entries it shows (`legend.data`),
 * which start off (`legend.selected`), how a click toggles them
 * (`legend.selectedMode`), and what a hidden entry does to the series.
 *
 * Everything is keyed by NAME, as ECharts keys it: an entry toggles every
 * series of that name.
 */
import { symbolPoints } from './pictorial'
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
  /** Each entry's icon by name: 'roundRect', a symbol, or 'line:<symbol>' for a line series (ECharts' `legendIcon`). */
  icons: Record<string, string>
  layout: OptionLegendLayout
  /** The toggle behaviour a click has. */
  selectedMode: LegendSelectedMode
  /** The names `legend.selected` turns off. */
  hidden: string[]
}

/** The option's legend over the compiled series, or null when it shows none. */
export function readOptionLegend(raw: unknown, series: Series[], seriesIcons: Record<string, string> = {}): OptionLegend | null {
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
  // The icon: `legend.data[i].icon`, else `legend.icon`, else the series' own (ECharts' `legendIcon`).
  const icons: Record<string, string> = {}
  const own = typeof l['icon'] === 'string' ? (l['icon'] as string) : undefined
  for (const n of names) icons[n] = own ?? seriesIcons[n] ?? 'roundRect'
  if (Array.isArray(l['data'])) {
    for (const d of l['data'] as unknown[]) {
      if (isObj(d) && typeof d['name'] === 'string' && typeof d['icon'] === 'string') icons[d['name'] as string] = d['icon'] as string
    }
  }
  return { entries: [...new Set(names)].map((label) => ({ label, color: colorOf.get(label)! })), icons, layout: readLegendLayout(l), selectedMode, hidden }
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
  /** The icon's box (ECharts' 25 × 14). */
  itemWidth: number
  itemHeight: number
  /** [top, right, bottom, left] round the block. */
  padding: number[]
  /** 'left' puts the icon before the text; 'right' after it. Auto: right for a vertical legend placed at the right. */
  align: 'left' | 'right' | 'auto'
  /** A hidden entry's colour (ECharts' `inactiveColor`). */
  inactiveColor: string
  background: string | undefined
  borderColor: string | undefined
  borderWidth: number
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
    itemWidth: typeof l['itemWidth'] === 'number' ? (l['itemWidth'] as number) : 25,
    itemHeight: typeof l['itemHeight'] === 'number' ? (l['itemHeight'] as number) : 14,
    padding: padding(l['padding']),
    align: l['align'] === 'left' || l['align'] === 'right' ? (l['align'] as 'left' | 'right') : 'auto',
    inactiveColor: typeof l['inactiveColor'] === 'string' ? (l['inactiveColor'] as string) : '#cfd2d7',
    background: typeof l['backgroundColor'] === 'string' && l['backgroundColor'] !== 'transparent' ? (l['backgroundColor'] as string) : undefined,
    borderColor: typeof l['borderColor'] === 'string' ? (l['borderColor'] as string) : undefined,
    borderWidth: typeof l['borderWidth'] === 'number' ? (l['borderWidth'] as number) : 0,
  }
}

/** A CSS-style padding: one number, [vertical, horizontal], or [top, right, bottom, left]. */
function padding(v: unknown): number[] {
  if (typeof v === 'number') return [v, v, v, v]
  if (Array.isArray(v) && v.every((x) => typeof x === 'number')) {
    const a = v as number[]
    if (a.length === 2) return [a[0]!, a[1]!, a[0]!, a[1]!]
    if (a.length === 4) return [a[0]!, a[1]!, a[2]!, a[3]!]
  }
  return [5, 5, 5, 5]
}

/** An entry's shown text, per the legend's `formatter`. */
export function legendText(name: string, formatter: OptionLegendLayout['formatter']): string {
  if (formatter === undefined) return name
  if (typeof formatter === 'function') return String(formatter(name) ?? '')
  return formatter.split('{name}').join(name)
}

/** The side of the chart a placed legend sits on. */
export type LegendSide = 'top' | 'bottom' | 'left' | 'right' | 'over'

/** A position in pixels: a number or a percent of `whole`; undefined for a keyword or nothing (ECharts' `parsePercent`). */
function px(v: string | number | undefined, whole: number): number | undefined {
  if (typeof v === 'number') return v
  if (typeof v !== 'string') return undefined
  const n = Number.parseFloat(v)
  if (!Number.isFinite(n)) return undefined
  return v.trim().endsWith('%') ? (n / 100) * whole : n
}

/**
 * ECharts' `getLayoutRect` along one axis: where a block of `size` starts
 * (`size` undefined: how much room it may take) between `near` / `far`
 * positions in `whole`, inside margins `m0` (near) / `m1` (far).
 */
function layoutAxis(near: string | number | undefined, far: string | number | undefined, whole: number, size: number | undefined, m0: number, m1: number, mid: string, farKey: string): { start: number; size: number } {
  const margin = m0 + m1
  const n = px(near, whole)
  const f = px(far, whole)
  let s = size ?? (n !== undefined && f !== undefined ? whole - f - margin - n : Number.NaN)
  let start = n ?? (f !== undefined && !Number.isNaN(s) ? whole - f - s - margin : Number.NaN)
  // The near key decides when set, keyword or not (`left || right`).
  const key = near ?? far
  if (key === 'center' || key === mid) start = whole / 2 - s / 2 - m0
  else if (key === farKey) start = whole - s - margin
  if (Number.isNaN(start)) start = 0
  if (Number.isNaN(s)) s = whole - margin - start - (f ?? 0)
  return { start: start + m0, size: s }
}

/** One entry laid out at the item's own origin: its commands and its bounding rect. */
interface LegendItem {
  cmds: DrawCmd[]
  rect: Rect
}

/** An entry's icon, text and bounds, as ECharts' `_createItem` builds them. */
function legendItem(text: string, color: string, icon: string, lineWidth: number, lay: OptionLegendLayout, align: 'left' | 'right', size: number, textColor: string, measure: (text: string, size: number) => number): LegendItem {
  const iw = lay.itemWidth
  const ih = lay.itemHeight
  const cmds: DrawCmd[] = []
  // The icon's bounds, stroke included, as zrender measures them.
  let ix0 = 0
  let iy0 = 0
  let ix1 = iw
  let iy1 = ih
  if (icon.startsWith('line:')) {
    const sym = icon.slice(5)
    const half = lineWidth / 2
    cmds.push({ kind: 'line', from: { x: 0, y: ih / 2 }, to: { x: iw, y: ih / 2 }, stroke: color, width: lineWidth })
    // The series' symbol at 80% of the item's height; an "empty" one is white inside a 2px ring.
    const d = ih * 0.8
    const cx = iw / 2
    const cy = ih / 2
    const empty = sym.startsWith('empty')
    const base = empty ? sym.slice(5).toLowerCase() : sym
    const cell = { x: cx - d / 2, y: cy - d / 2, w: d, h: d }
    if (base === 'circle' || base === 'none') {
      if (empty) {
        cmds.push({ kind: 'circle', center: { x: cx, y: cy }, radius: d / 2 + 1, fill: color })
        cmds.push({ kind: 'circle', center: { x: cx, y: cy }, radius: d / 2 - 1, fill: '#ffffff' })
      } else cmds.push({ kind: 'circle', center: { x: cx, y: cy }, radius: d / 2, fill: color })
    } else {
      cmds.push({ kind: 'polygon', points: symbolPoints(cell, base === 'roundRect' ? 'rect' : base), fill: color })
    }
    const ring = empty ? 1 : 0
    ix0 = -half
    ix1 = iw + half
    iy0 = Math.min(ih / 2 - half, cy - d / 2 - ring)
    iy1 = Math.max(ih / 2 + half, cy + d / 2 + ring)
  } else if (icon === 'roundRect' || icon === 'rect') {
    const r = icon === 'roundRect' ? Math.min(iw, ih) / 4 : 0
    cmds.push(r > 0 ? { kind: 'rect', rect: { x: 0, y: 0, w: iw, h: ih }, fill: color, corners: [r, r, r, r] } : { kind: 'rect', rect: { x: 0, y: 0, w: iw, h: ih }, fill: color })
  } else {
    // A symbol keeps its aspect: a square of the smaller side, centred.
    const d = Math.min(iw, ih)
    const cell = { x: (iw - d) / 2, y: (ih - d) / 2, w: d, h: d }
    const empty = icon.startsWith('empty')
    const base = empty ? icon.slice(5).toLowerCase() : icon
    if (base === 'circle') {
      cmds.push({ kind: 'circle', center: { x: iw / 2, y: ih / 2 }, radius: d / 2 + (empty ? 1 : 0), fill: color })
      if (empty) cmds.push({ kind: 'circle', center: { x: iw / 2, y: ih / 2 }, radius: d / 2 - 1, fill: '#ffffff' })
    } else cmds.push({ kind: 'polygon', points: symbolPoints(cell, base), fill: color })
    ix0 = cell.x - (empty ? 1 : 0)
    ix1 = cell.x + d + (empty ? 1 : 0)
    iy0 = cell.y - (empty ? 1 : 0)
    iy1 = cell.y + d + (empty ? 1 : 0)
  }
  const tw = measure(text, size)
  const tx = align === 'left' ? iw + 5 : -5
  cmds.push({ kind: 'text', text, at: { x: tx, y: ih / 2 }, fill: textColor, size, align: align === 'left' ? 'start' : 'end', baseline: 'middle' })
  const t0 = align === 'left' ? tx : tx - tw
  const x0 = Math.min(ix0, t0)
  const x1 = Math.max(ix1, t0 + tw)
  const y0 = Math.min(iy0, ih / 2 - size / 2)
  const y1 = Math.max(iy1, ih / 2 + size / 2)
  return { cmds, rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } }
}

/**
 * Lay the legend out and place it as ECharts 6 does: each entry an icon
 * (by series type) and its name, laid in a row that wraps at the available
 * width (ECharts' `boxLayout`), the block centred 15px above the bottom
 * inside a 5px padding by default; `left` / `right` / `top` / `bottom` move
 * it and `orient: 'vertical'` stacks the entries into columns. Returns the
 * commands, each entry's hit box, the block's rect and the side it sits on.
 */
export function placeOptionLegend(
  entries: LegendEntry[],
  layout: OptionLegendLayout | undefined,
  box: { x: number; y: number; w: number; h: number },
  theme: { fontSize: number; label: string },
  measure: (text: string, size: number) => number,
  icons: Record<string, string> = {},
  lineWidths: Record<string, number> = {},
): { cmds: DrawCmd[]; boxes: Rect[]; rect: Rect; side: LegendSide } {
  const lay = layout ?? readLegendLayout({})
  const vertical = lay.orient === 'vertical'
  const [pt, pr, pb, pl] = lay.padding as [number, number, number, number]
  // ECharts 6's default: left 'center', bottom 15.
  const left = lay.left ?? (lay.right === undefined ? 'center' : undefined)
  const bottom = lay.bottom ?? (lay.top === undefined ? 15 : undefined)
  const align: 'left' | 'right' = lay.align !== 'auto' ? lay.align : lay.left === 'right' && vertical ? 'right' : 'left'
  const size = lay.fontSize ?? 12
  const gap = lay.itemGap ?? 8
  const items = entries.map((e) => {
    const off = e.muted === true
    const color = off ? lay.inactiveColor : e.color
    return legendItem(legendText(e.label, lay.formatter), color, icons[e.label] ?? 'roundRect', lineWidths[e.label] ?? 2, lay, align, size, off ? lay.inactiveColor : (lay.color ?? theme.label), measure)
  })
  // The room the block may take (getLayoutRect with no size), then boxLayout.
  const maxW = layoutAxis(left, lay.right, box.w, undefined, pl, pr, 'center', 'right').size
  const maxH = layoutAxis(lay.top, bottom, box.h, undefined, pt, pb, 'middle', 'bottom').size
  const at: { x: number; y: number }[] = []
  let x = 0
  let y = 0
  let line = 0
  for (let i = 0; i < items.length; i++) {
    const r = items[i]!.rect
    const next = items[i + 1]?.rect
    if (!vertical) {
      const moveX = r.w + (next !== undefined ? -next.x + r.x : 0)
      let nextX = x + moveX
      if (nextX > maxW) {
        x = 0
        nextX = moveX
        y += line + gap
        line = r.h
      } else line = Math.max(line, r.h)
      at.push({ x, y })
      x = nextX + gap
    } else {
      const moveY = r.h + (next !== undefined ? -next.y + r.y : 0)
      let nextY = y + moveY
      if (nextY > maxH) {
        x += line + gap
        y = 0
        nextY = moveY
        line = r.w
      } else line = Math.max(line, r.w)
      at.push({ x, y })
      y = nextY + gap
    }
  }
  // The content's bounding rect, then the block placed by getLayoutRect at that size.
  let mx0 = Number.POSITIVE_INFINITY
  let my0 = Number.POSITIVE_INFINITY
  let mx1 = Number.NEGATIVE_INFINITY
  let my1 = Number.NEGATIVE_INFINITY
  items.forEach((it, i) => {
    mx0 = Math.min(mx0, at[i]!.x + it.rect.x)
    my0 = Math.min(my0, at[i]!.y + it.rect.y)
    mx1 = Math.max(mx1, at[i]!.x + it.rect.x + it.rect.w)
    my1 = Math.max(my1, at[i]!.y + it.rect.y + it.rect.h)
  })
  if (items.length === 0) {
    mx0 = 0
    my0 = 0
    mx1 = 0
    my1 = 0
  }
  const mw = mx1 - mx0
  const mh = my1 - my0
  const px0 = layoutAxis(left, lay.right, box.w, mw, pl, pr, 'center', 'right').start
  const py0 = layoutAxis(lay.top, bottom, box.h, mh, pt, pb, 'middle', 'bottom').start
  const gx = box.x + px0 - mx0
  const gy = box.y + py0 - my0
  const cmds: DrawCmd[] = []
  const blockRect: Rect = { x: box.x + px0, y: box.y + py0, w: mw, h: mh }
  if (lay.background !== undefined || lay.borderWidth > 0) {
    const bg: Rect = { x: blockRect.x - pl, y: blockRect.y - pt, w: mw + pl + pr, h: mh + pt + pb }
    if (lay.background !== undefined) cmds.push({ kind: 'rect', rect: bg, fill: lay.background })
    if (lay.borderWidth > 0) cmds.push({ kind: 'polyline', points: [{ x: bg.x, y: bg.y }, { x: bg.x + bg.w, y: bg.y }, { x: bg.x + bg.w, y: bg.y + bg.h }, { x: bg.x, y: bg.y + bg.h }, { x: bg.x, y: bg.y }], stroke: lay.borderColor ?? '#b7b9be', width: lay.borderWidth })
  }
  const boxes: Rect[] = []
  items.forEach((it, i) => {
    const ox = gx + at[i]!.x
    const oy = gy + at[i]!.y
    for (const c of it.cmds) cmds.push(translate(c, ox, oy))
    boxes.push({ x: ox + it.rect.x, y: oy + it.rect.y, w: it.rect.w, h: it.rect.h })
  })
  const cxRel = px0 + mw / 2
  const cyRel = py0 + mh / 2
  const side: LegendSide = vertical ? (cxRel > box.w / 2 ? 'right' : 'left') : cyRel > box.h / 2 ? 'bottom' : 'top'
  return { cmds, boxes, rect: blockRect, side }
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
