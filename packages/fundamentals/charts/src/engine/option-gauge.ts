/**
 * ECharts' gauge keys read into the engine's `DialSpec`, with ECharts 6's own
 * defaults (and its theme tokens for the colours it does not take from the
 * palette): the dial's angles and range, the axis line's colour bands,
 * progress, split lines, ticks, labels, pointer, anchor, and each value's
 * title and detail.
 */
import type { DialDatum, DialLen, DialSpec, DialStop } from './gauge-dial'
import { defaultTheme } from './render'
import type { ChartTheme } from './render'
import { arcSweep } from './option-pie'
import type { Double } from './types'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const obj = (v: unknown): Obj => (isObj(v) ? v : {})
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const RADIAN = Math.PI / 180.0

/** ECharts 6's theme tokens the gauge defaults name. */
const TOKEN = {
  band: '#e8ebf0', // neutral10
  splitLine: '#54555a', // axisTick
  tick: '#6d6e73', // axisTickMinor
  label: '#54555a', // axisLabel
  title: '#54555a', // secondary
  detail: '#3c3c41', // primary
  anchor: '#fff', // neutral00
  anchorBorder: '#5070dd', // theme[0]
}

/**
 * The dial under a THEME. ECharts' gauge defaults are light-theme tokens (dark
 * grey text, a near-white track); under the default theme they stay exactly
 * ECharts', and under any other a colour still equal to its ECharts default
 * takes the theme's own token instead — the detail value is the theme's text,
 * the labels and title its label colour, the track its muted colour. A colour
 * the option SET differently is left alone. Without this a gauge under a dark
 * theme drew its value in #3c3c41 on a #141821 ground.
 */
export function themedDial(dial: DialSpec, t: ChartTheme): DialSpec {
  if (t.text === defaultTheme.text && t.label === defaultTheme.label) return dial
  const swap = (c: string, from: string, to: string): string => (c === from ? to : c)
  return {
    ...dial,
    stops: dial.stops.map((st) => ({ at: st.at, color: swap(st.color, TOKEN.band, t.muted) })),
    splitColor: swap(dial.splitColor, TOKEN.splitLine, t.axis),
    tickColor: swap(dial.tickColor, TOKEN.tick, t.axis),
    labelColor: swap(dial.labelColor, TOKEN.label, t.label),
    titleColor: swap(dial.titleColor, TOKEN.title, t.label),
    detailColor: swap(dial.detailColor, TOKEN.detail, t.text),
    anchorColor: swap(dial.anchorColor, TOKEN.anchor, t.surface),
  }
}

/** A colour that paints nothing. */
const isTransparent = (c: string): boolean => c === 'transparent' || c === 'none' || /^rgba\([^)]*,\s*0\s*\)$/.test(c)

/** A number, or a 'N%' string as a fraction of the radius. */
export function readDialLen(v: unknown, fallback: DialLen): DialLen {
  if (typeof v === 'number' && Number.isFinite(v)) return { v, pct: false }
  if (typeof v === 'string' && v.trim().endsWith('%')) {
    const n = Number.parseFloat(v)
    return Number.isFinite(n) ? { v: n / 100.0, pct: true } : fallback
  }
  if (typeof v === 'string') {
    const n = Number.parseFloat(v)
    return Number.isFinite(n) ? { v: n, pct: false } : fallback
  }
  return fallback
}

const px = (v: Double): DialLen => ({ v, pct: false })
const pc = (v: Double): DialLen => ({ v, pct: true })

/** ECharts' `offsetCenter`: `[x, y]`, each a length or a percent of the radius. */
function offset(v: unknown, fx: DialLen, fy: DialLen): { x: DialLen; y: DialLen } {
  const a = Array.isArray(v) ? v : []
  return { x: readDialLen(a[0], fx), y: readDialLen(a[1], fy) }
}

/** ECharts' gauge `formatLabel`: the value as a string, through a '{value}' template or a function. */
export function gaugeText(value: Double | null, formatter: unknown): string {
  const label = value === null ? '' : String(value)
  if (typeof formatter === 'string') return formatter.replace('{value}', label)
  if (typeof formatter === 'function') {
    const out = (formatter as (v: unknown) => unknown)(value)
    return out === undefined || out === null ? '' : String(out)
  }
  return label
}

/** The gauge's axis line colour bands: `[[0.3, '#67e0e3'], [1, '#fd666d']]`. */
function readStops(v: unknown): DialStop[] {
  if (typeof v === 'string') return [{ at: 1.0, color: v }]
  if (!Array.isArray(v)) return [{ at: 1.0, color: TOKEN.band }]
  const out: DialStop[] = []
  for (const e of v) {
    if (Array.isArray(e) && typeof e[0] === 'number' && typeof e[1] === 'string') out.push({ at: e[0], color: e[1] })
  }
  return out.length > 0 ? out : [{ at: 1.0, color: TOKEN.band }]
}

/** The symbols the dial can draw for a pointer or anchor icon. */
const ICONS: ReadonlySet<string> = new Set(['rect', 'roundRect', 'circle', 'emptyCircle', 'diamond', 'triangle', 'arrow'])

/** An icon the dial draws, or `fallback` (after a warning) for one it does not — an image or a `path://` outline. */
function readIcon(v: unknown, fallback: string, path: string, warn: (path: string, message: string) => void): string {
  if (typeof v !== 'string' || v === '') return fallback
  if (ICONS.has(v)) return v
  warn(path, `The "${v}" icon is not drawn yet (rect, roundRect, circle, diamond, triangle and arrow are); the default was used.`)
  return fallback
}

/** A CSS-style padding: one number, or [vertical, horizontal], or [top, right, bottom, left]. */
function padding(v: unknown, fallback: Double[]): Double[] {
  if (typeof v === 'number') return [v, v, v, v]
  if (Array.isArray(v) && v.every((x) => typeof x === 'number')) {
    const a = v as number[]
    if (a.length === 2) return [a[0]!, a[1]!, a[0]!, a[1]!]
    if (a.length === 4) return [a[0]!, a[1]!, a[2]!, a[3]!]
  }
  return fallback
}

/** A gauge series read into a dial. `palette` colours each datum by index (`colorBy: 'data'`); '' leaves it to the theme. */
export function readGaugeDial(s: Obj, palette: readonly string[], warn: (path: string, message: string) => void = () => undefined): DialSpec {
  const axisLine = obj(s['axisLine'])
  const lineStyle = obj(axisLine['lineStyle'])
  const progress = obj(s['progress'])
  const splitLine = obj(s['splitLine'])
  const splitStyle = obj(splitLine['lineStyle'])
  const tick = obj(s['axisTick'])
  const tickStyle = obj(tick['lineStyle'])
  const label = obj(s['axisLabel'])
  const pointer = obj(s['pointer'])
  const anchor = obj(s['anchor'])
  const anchorStyle = obj(anchor['itemStyle'])
  const title = obj(s['title'])
  const detail = obj(s['detail'])
  const item = obj(s['itemStyle'])

  const start = -(num(s['startAngle']) ?? 225.0) * RADIAN
  const clockwise = s['clockwise'] !== false
  const sweep = arcSweep(start, -(num(s['endAngle']) ?? -45.0) * RADIAN, clockwise)
  const min = num(s['min']) ?? 0.0
  const max = num(s['max']) ?? 100.0
  const splitNumber = Math.max(1, Math.round(num(s['splitNumber']) ?? 10))

  const labels: string[] = []
  for (let i = 0; i <= splitNumber; i++) {
    // ECharts rounds each tick value to ten places before printing it.
    const v = Number(((i * (max - min)) / splitNumber + min).toFixed(10))
    labels.push(gaugeText(v, label['formatter']))
  }

  const titleOffset = offset(title['offsetCenter'], px(0), pc(0.2))
  const detailOffset = offset(detail['offsetCenter'], px(0), pc(0.4))
  const pointerOffset = offset(pointer['offsetCenter'], px(0), px(0))
  const anchorOffset = offset(anchor['offsetCenter'], px(0), px(0))
  const raw = Array.isArray(s['data']) ? (s['data'] as unknown[]) : s['data'] === undefined ? [] : [s['data']]
  const data: DialDatum[] = []
  for (let i = 0; i < raw.length; i++) {
    const d = raw[i]
    const o = obj(d)
    const value = isObj(d) ? num(o['value']) ?? null : num(d) ?? null
    const own = obj(o['itemStyle'])
    const ownTitle = offset(obj(o['title'])['offsetCenter'], titleOffset.x, titleOffset.y)
    const ownDetail = offset(obj(o['detail'])['offsetCenter'], detailOffset.x, detailOffset.y)
    data.push({
      value: value ?? min,
      name: str(o['name']) ?? '',
      detail: detail['show'] === false ? '' : gaugeText(value, obj(o['detail'])['formatter'] ?? detail['formatter']),
      color: str(own['color']) ?? str(item['color']) ?? (palette.length > 0 ? palette[i % palette.length]! : ''),
      pointerColor: str(obj(obj(o['pointer'])['itemStyle'])['color']) ?? str(obj(pointer['itemStyle'])['color']) ?? '',
      progressColor: str(obj(obj(o['progress'])['itemStyle'])['color']) ?? str(obj(progress['itemStyle'])['color']) ?? '',
      titleX: ownTitle.x,
      titleY: ownTitle.y,
      detailX: ownDetail.x,
      detailY: ownDetail.y,
    })
  }

  const rot = label['rotate']
  return {
    start,
    sweep,
    clockwise,
    min,
    max,
    splitNumber,
    lineShow: axisLine['show'] !== false,
    lineWidth: num(lineStyle['width']) ?? 10.0,
    stops: readStops(lineStyle['color']),
    lineRound: axisLine['roundCap'] === true,
    progressShow: progress['show'] === true,
    progressRound: progress['roundCap'] === true,
    progressOverlap: progress['overlap'] !== false,
    progressWidth: num(progress['width']) ?? 10.0,
    progressClip: progress['clip'] !== false,
    splitShow: splitLine['show'] !== false,
    splitLength: readDialLen(splitLine['length'], px(10)),
    splitDistance: num(splitLine['distance']) ?? 10.0,
    splitColor: str(splitStyle['color']) ?? TOKEN.splitLine,
    splitWidth: num(splitStyle['width']) ?? 3.0,
    tickShow: tick['show'] !== false,
    tickSplit: Math.max(1, Math.round(num(tick['splitNumber']) ?? 5)),
    tickLength: readDialLen(tick['length'], px(6)),
    tickDistance: num(tick['distance']) ?? 10.0,
    tickColor: str(tickStyle['color']) ?? TOKEN.tick,
    tickWidth: num(tickStyle['width']) ?? 1.0,
    labelShow: label['show'] !== false,
    labelDistance: num(label['distance']) ?? 15.0,
    labelColor: label['color'] === 'auto' ? '' : str(label['color']) ?? TOKEN.label,
    labelSize: num(label['fontSize']) ?? 12.0,
    labels,
    labelRotate: typeof rot === 'number' && rot !== 0 ? 'fixed' : rot === 'radial' || rot === 'tangential' ? rot : '',
    labelDegrees: typeof rot === 'number' ? rot : 0.0,
    pointerShow: pointer['show'] !== false,
    pointerIcon: readIcon(pointer['icon'], '', 'series[0].pointer.icon', warn),
    pointerAbove: pointer['showAbove'] !== false,
    pointerLength: readDialLen(pointer['length'], pc(0.6)),
    pointerWidth: readDialLen(pointer['width'], px(6)),
    pointerX: pointerOffset.x,
    pointerY: pointerOffset.y,
    anchorShow: anchor['show'] === true,
    anchorIcon: readIcon(anchor['icon'], 'circle', 'series[0].anchor.icon', warn),
    anchorAbove: anchor['showAbove'] === true,
    anchorSize: num(anchor['size']) ?? 6.0,
    anchorColor: str(anchorStyle['color']) ?? TOKEN.anchor,
    anchorBorder: str(anchorStyle['borderColor']) ?? TOKEN.anchorBorder,
    anchorBorderWidth: num(anchorStyle['borderWidth']) ?? 0.0,
    anchorX: anchorOffset.x,
    anchorY: anchorOffset.y,
    titleShow: title['show'] !== false,
    titleColor: str(title['color']) ?? TOKEN.title,
    titleSize: num(title['fontSize']) ?? 16.0,
    detailShow: detail['show'] !== false,
    detailColor: detail['color'] === 'auto' || detail['color'] === 'inherit' ? '' : str(detail['color']) ?? TOKEN.detail,
    detailSize: num(detail['fontSize']) ?? 30.0,
    detailBold: (detail['fontWeight'] ?? 'bold') === 'bold' || (typeof detail['fontWeight'] === 'number' && (detail['fontWeight'] as number) >= 600),
    detailBg: typeof detail['backgroundColor'] === 'string' && !isTransparent(detail['backgroundColor'] as string) ? (detail['backgroundColor'] as string) : '',
    detailBorder: str(detail['borderColor']) ?? '#9ea0a5',
    detailBorderWidth: num(detail['borderWidth']) ?? 0.0,
    detailWidth: num(detail['width']) ?? 100.0,
    detailHeight: num(detail['height']) ?? num(detail['lineHeight']) ?? -1.0,
    detailPadding: padding(detail['padding'], [5.0, 10.0, 5.0, 10.0]),
    data,
  }
}

/** The gauge keys this module reads, for the family's known-key set. */
export const GAUGE_DIAL_KEYS = ['startAngle', 'endAngle', 'clockwise', 'splitNumber', 'axisLine', 'progress', 'splitLine', 'axisTick', 'axisLabel', 'pointer', 'anchor', 'title', 'detail', 'radius', 'center'] as const
