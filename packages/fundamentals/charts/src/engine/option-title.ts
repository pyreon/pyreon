/**
 * ECharts' `title` component on an option chart, placed as its `TitleView`
 * places it: the text and subtext as one block, sized by their measured
 * widths, positioned by `left` / `right` / `top` / `bottom` inside the
 * component's `padding` (ECharts' `getLayoutRect`), and aligned by the
 * position keyword (or `textAlign` / `textVerticalAlign`). ECharts 6's
 * defaults: centred, 15px from the top, 18px bold over a 12px subtext 10px
 * below it. Colours come from the chart's theme.
 */
import type { ChartTheme } from './render'
import type { DrawCmd, Double, MeasureText, Rect } from './types'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const pos = (v: unknown): string | number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' ? v : undefined)

export interface OptionTitle {
  text: string
  subtext: string | undefined
  /** Where the block sits: a keyword, pixels, or a percent of the chart. */
  left: string | number | undefined
  right: string | number | undefined
  top: string | number | undefined
  bottom: string | number | undefined
  /** How the text hangs off its anchor; the position keyword decides without it. */
  textAlign: 'left' | 'center' | 'right' | undefined
  textVerticalAlign: 'top' | 'middle' | 'bottom' | undefined
  color: string | undefined
  fontSize: Double | undefined
  bold: boolean
  subColor: string | undefined
  subFontSize: Double | undefined
  subBold: boolean
  /** Pixels between the title and the subtext. */
  itemGap: Double | undefined
  /** [top, right, bottom, left] round the block. */
  padding: Double[]
  background: string | undefined
  borderColor: string | undefined
  borderWidth: Double
  /** A URL a click on the title / subtext opens, and the window it opens in ('blank' or 'self'). */
  link: string | undefined
  target: string
  sublink: string | undefined
  subtarget: string
}

/** A linked piece of the title: where it was drawn, and what a click opens. */
export interface TitleLink {
  rect: Rect
  url: string
  /** The window name `window.open` takes: '_blank' or '_self'. */
  target: string
}

/** A CSS-style padding: one number, [vertical, horizontal], or [top, right, bottom, left]. */
function padding(v: unknown): Double[] {
  if (typeof v === 'number') return [v, v, v, v]
  if (Array.isArray(v) && v.every((x) => typeof x === 'number')) {
    const a = v as number[]
    if (a.length === 2) return [a[0]!, a[1]!, a[0]!, a[1]!]
    if (a.length === 4) return [a[0]!, a[1]!, a[2]!, a[3]!]
  }
  return [5, 5, 5, 5]
}

const isBold = (w: unknown, byDefault: boolean): boolean => (w === undefined ? byDefault : w === 'bold' || w === 'bolder' || (typeof w === 'number' && w >= 600))

/** The option's title, or null when it has no text. */
export function readOptionTitle(raw: unknown): OptionTitle | null {
  if (!isObj(raw) || typeof raw['text'] !== 'string' || raw['show'] === false) return null
  const ts = isObj(raw['textStyle']) ? raw['textStyle'] : {}
  const ss = isObj(raw['subtextStyle']) ? raw['subtextStyle'] : {}
  const ta = raw['textAlign']
  const tv = raw['textVerticalAlign'] ?? raw['textBaseline']
  const bg = str(raw['backgroundColor'])
  return {
    text: raw['text'] as string,
    subtext: str(raw['subtext']) === '' ? undefined : str(raw['subtext']),
    left: pos(raw['left']),
    right: pos(raw['right']),
    top: pos(raw['top']),
    bottom: pos(raw['bottom']),
    textAlign: ta === 'left' || ta === 'center' || ta === 'right' ? ta : undefined,
    textVerticalAlign: tv === 'top' || tv === 'middle' || tv === 'bottom' ? tv : undefined,
    color: str(ts['color']),
    fontSize: num(ts['fontSize']),
    bold: isBold(ts['fontWeight'], true),
    subColor: str(ss['color']),
    subFontSize: num(ss['fontSize']),
    subBold: isBold(ss['fontWeight'], false),
    itemGap: num(raw['itemGap']),
    padding: padding(raw['padding']),
    background: bg === undefined || bg === 'transparent' || /^rgba\([^)]*,\s*0\s*\)$/.test(bg) ? undefined : bg,
    borderColor: str(raw['borderColor']),
    borderWidth: num(raw['borderWidth']) ?? 0,
    link: str(raw['link']) === '' ? undefined : str(raw['link']),
    target: raw['target'] === 'self' ? 'self' : 'blank',
    sublink: str(raw['sublink']) === '' ? undefined : str(raw['sublink']),
    subtarget: raw['subtarget'] === 'self' ? 'self' : 'blank',
  }
}

/** A position in pixels: a number, a percent of `whole`, or undefined for a keyword / nothing. */
const px = (v: string | number | undefined, whole: Double): Double | undefined => {
  if (typeof v === 'number') return v
  if (typeof v !== 'string') return undefined
  if (v.endsWith('%')) {
    const n = Number.parseFloat(v)
    return Number.isFinite(n) ? (n / 100) * whole : undefined
  }
  const n = Number.parseFloat(v)
  return Number.isFinite(n) ? n : undefined
}

const DRAW_ALIGN = { left: 'start', center: 'middle', right: 'end' } as const
const DRAW_BASELINE = { top: 'top', middle: 'middle', bottom: 'bottom' } as const

/**
 * The title's commands on a `width` × `height` chart, and the height a plot
 * below it must leave (0 when the title sits at the middle or bottom).
 */
export function optionTitleCommands(title: OptionTitle, width: Double, height: Double, t: ChartTheme, measure: MeasureText): { cmds: DrawCmd[]; height: Double; links: TitleLink[] } {
  const size = title.fontSize ?? 18
  const subSize = title.subFontSize ?? 12
  const gap = title.itemGap ?? 10
  const hasSub = title.subtext !== undefined
  const blockW = Math.max(measure(title.text, size), hasSub ? measure(title.subtext!, subSize) : 0)
  const blockH = size + (hasSub ? gap + subSize : 0)
  const [pt, pr, pb, pl] = title.padding as [Double, Double, Double, Double]

  // ECharts 6's default is left: 'center', top: 15 — unless the option places it from the other side.
  const leftKey = title.left ?? (title.right === undefined ? 'center' : undefined)
  const topKey = title.top ?? (title.bottom === undefined ? 15 : undefined)

  // getLayoutRect, horizontally.
  let x: Double
  const hKey = leftKey ?? title.right
  if (hKey === 'center') x = width / 2 - blockW / 2
  else if (hKey === 'right') x = width - blockW - pr
  else {
    const l = px(leftKey, width)
    const r = px(title.right, width)
    x = l !== undefined ? l + pl : r !== undefined ? width - r - blockW - pr : pl
  }
  // …and vertically.
  let y: Double
  const vKey = topKey ?? title.bottom
  if (vKey === 'middle' || vKey === 'center') y = height / 2 - blockH / 2
  else if (vKey === 'bottom') y = height - blockH - pb
  else {
    const tp = px(topKey, height)
    const bt = px(title.bottom, height)
    y = tp !== undefined ? tp + pt : bt !== undefined ? height - bt - blockH - pb : pt
  }

  // The keyword the block was placed by also aligns its text (TitleView), unless the option says otherwise.
  let align: 'left' | 'center' | 'right' = 'left'
  if (title.textAlign !== undefined) align = title.textAlign
  else if (hKey === 'center') {
    align = 'center'
    x = x + blockW / 2
  } else if (hKey === 'right') {
    align = 'right'
    x = x + blockW
  }
  let valign: 'top' | 'middle' | 'bottom' = 'top'
  if (title.textVerticalAlign !== undefined) valign = title.textVerticalAlign
  else if (vKey === 'bottom') {
    valign = 'bottom'
    y = y + blockH
  } else if (vKey === 'middle' || vKey === 'center') {
    valign = 'middle'
    y = y + blockH / 2
  }

  const cmds: DrawCmd[] = []
  if (title.background !== undefined || title.borderWidth > 0) {
    // The box round the block, where the block was laid (before alignment moved its anchor).
    const bx = (align === 'center' ? x - blockW / 2 : align === 'right' ? x - blockW : x) - pl
    const by = (valign === 'middle' ? y - blockH / 2 : valign === 'bottom' ? y - blockH : y) - pt
    const box = { x: bx, y: by, w: blockW + pl + pr, h: blockH + pt + pb }
    if (title.background !== undefined) cmds.push({ kind: 'rect', rect: box, fill: title.background })
    if (title.borderWidth > 0) {
      cmds.push({ kind: 'polyline', points: [{ x: box.x, y: box.y }, { x: box.x + box.w, y: box.y }, { x: box.x + box.w, y: box.y + box.h }, { x: box.x, y: box.y + box.h }, { x: box.x, y: box.y }], stroke: title.borderColor ?? t.text, width: title.borderWidth })
    }
  }
  const text: DrawCmd = { kind: 'text', text: title.text, at: { x, y }, fill: title.color ?? t.text, size, align: DRAW_ALIGN[align], baseline: DRAW_BASELINE[valign] }
  cmds.push(title.bold ? { ...text, weight: 'bold' } : text)
  if (hasSub) {
    const sub: DrawCmd = { kind: 'text', text: title.subtext!, at: { x, y: y + size + gap }, fill: title.subColor ?? t.label, size: subSize, align: DRAW_ALIGN[align], baseline: DRAW_BASELINE[valign] }
    cmds.push(title.subBold ? { ...sub, weight: 'bold' } : sub)
  }
  // What a click on a linked line hits: that line's own text, where it was drawn.
  const links: TitleLink[] = []
  const lineBox = (w: Double, h: Double, ly: Double): Rect => ({
    x: align === 'center' ? x - w / 2 : align === 'right' ? x - w : x,
    y: valign === 'middle' ? ly - h / 2 : valign === 'bottom' ? ly - h : ly,
    w,
    h,
  })
  if (title.link !== undefined) links.push({ rect: lineBox(measure(title.text, size), size, y), url: title.link, target: '_' + title.target })
  if (hasSub && title.sublink !== undefined) links.push({ rect: lineBox(measure(title.subtext!, subSize), subSize, y + size + gap), url: title.sublink, target: '_' + title.subtarget })
  // A plot laid below the chrome leaves room for a title at the top.
  const atTop = vKey !== 'middle' && vKey !== 'center' && vKey !== 'bottom' && title.bottom === undefined
  return { cmds, height: atTop ? y + blockH + pb : 0, links }
}
