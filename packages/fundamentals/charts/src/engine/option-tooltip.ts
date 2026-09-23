/**
 * ECharts' `tooltip` component → what the option chart's host shows.
 *
 * The facade used to read `tooltip` as show/hide and drop everything else
 * without a word: `trigger`, `formatter`, `valueFormatter`, `position`,
 * `axisPointer` and the styling keys vanished silently. Each is read here, and
 * a key that cannot be honoured is named.
 */
import type { OptionWarning } from './option'
import type { Double } from './types'

export type TooltipTrigger = 'item' | 'axis' | 'none'
export type AxisPointerType = 'line' | 'shadow' | 'cross' | 'none'

/** ECharts' `tooltip.position`: a named side of the hovered item, a fixed point, or a function. */
export type TooltipPositionSpec =
  | { kind: 'follow' }
  | { kind: 'side'; side: 'inside' | 'top' | 'bottom' | 'left' | 'right' }
  | { kind: 'point'; x: string | number; y: string | number }
  | { kind: 'fn'; fn: (...args: unknown[]) => unknown }

export interface TooltipSpec {
  show: boolean
  /** Whether the box shows (`showContent: false` keeps the axis pointer without it). */
  showContent: boolean
  trigger: TooltipTrigger
  /** `mousemove` (hover), `click`, both, or `none` (only an action shows it). */
  triggerOn: 'mousemove' | 'click' | 'mousemove|click' | 'none'
  formatter: string | ((params: unknown, ticket?: string) => unknown) | undefined
  valueFormatter: ((value: unknown, dataIndex: number) => unknown) | undefined
  position: TooltipPositionSpec
  confine: boolean
  order: 'seriesAsc' | 'seriesDesc' | 'valueAsc' | 'valueDesc'
  enterable: boolean
  alwaysShowContent: boolean
  showDelay: Double
  hideDelay: Double
  /** Seconds, as ECharts writes it. */
  transitionDuration: Double
  axisPointer: {
    type: AxisPointerType
    color: string | undefined
    width: Double | undefined
    dashed: boolean
    shadowColor: string | undefined
    label: boolean
  }
  /** The box's own look: CSS the host appends to its themed tooltip style. */
  css: string
  className: string | undefined
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

const TOOLTIP_KEYS = new Set([
  'show', 'showContent', 'trigger', 'triggerOn', 'formatter', 'valueFormatter', 'position', 'confine', 'order',
  'enterable', 'alwaysShowContent', 'showDelay', 'hideDelay', 'transitionDuration', 'axisPointer',
  'backgroundColor', 'borderColor', 'borderWidth', 'borderRadius', 'padding', 'textStyle', 'extraCssText', 'className',
  'shadowBlur', 'shadowColor', 'shadowOffsetX', 'shadowOffsetY',
])
const AXIS_POINTER_KEYS = new Set(['type', 'snap', 'lineStyle', 'shadowStyle', 'crossStyle', 'label', 'axis'])

/** CSS for a padding value in ECharts' shorthand forms (a number or 1–4 numbers). */
function paddingCss(v: unknown): string | undefined {
  if (typeof v === 'number') return `${v}px`
  if (Array.isArray(v) && v.length >= 1 && v.length <= 4 && v.every((n) => typeof n === 'number')) return v.map((n) => `${n}px`).join(' ')
  return undefined
}

/**
 * Read ECharts' `tooltip`. Null when the option has no tooltip component —
 * ECharts shows no tooltip then, and neither does the host.
 */
export function readTooltipOption(raw: unknown, warn: (code: OptionWarning['code'], path: string, message: string) => void): TooltipSpec | null {
  if (raw === undefined) return null
  const t = isObj(raw) ? raw : {}
  for (const key of Object.keys(t)) {
    if (TOOLTIP_KEYS.has(key)) continue
    if (key === 'appendToBody' || key === 'appendTo') {
      // ledger: coordinates.tooltip
      warn('option-key-unsupported', `tooltip.${key}`, `tooltip.${key} moves the box out of the chart's own element; the box stays inside the chart.`)
    } else if (key === 'renderMode') {
      // ledger: coordinates.tooltip
      if (t[key] === 'richText') warn('option-key-unsupported', 'tooltip.renderMode', 'the richText render mode is not supported; the formatter output renders as HTML.')
    } else if (key === 'displayMode') {
      // ledger: coordinates.tooltip
      if (t[key] !== 'single') warn('option-key-unsupported', 'tooltip.displayMode', 'one tooltip is shown per chart; displayMode "multipleByCoordSys" is not supported.')
    } else {
      // ledger: coordinates.tooltip
      warn('option-key-unsupported', `tooltip.${key}`, `"tooltip.${key}" has no mapping yet; it was ignored.`)
    }
  }

  const trigger: TooltipTrigger = t['trigger'] === 'axis' ? 'axis' : t['trigger'] === 'none' ? 'none' : 'item'
  const triggerOn = t['triggerOn'] === 'click' || t['triggerOn'] === 'none' || t['triggerOn'] === 'mousemove|click' ? t['triggerOn'] : 'mousemove'
  const formatterRaw = t['formatter']
  const formatter = typeof formatterRaw === 'string' || typeof formatterRaw === 'function' ? (formatterRaw as TooltipSpec['formatter']) : undefined
  const valueFormatter = typeof t['valueFormatter'] === 'function' ? (t['valueFormatter'] as TooltipSpec['valueFormatter']) : undefined

  const positionRaw = t['position']
  let position: TooltipPositionSpec = { kind: 'follow' }
  if (typeof positionRaw === 'function') position = { kind: 'fn', fn: positionRaw as (...args: unknown[]) => unknown }
  else if (positionRaw === 'inside' || positionRaw === 'top' || positionRaw === 'bottom' || positionRaw === 'left' || positionRaw === 'right') position = { kind: 'side', side: positionRaw }
  else if (Array.isArray(positionRaw) && positionRaw.length === 2 && positionRaw.every((p) => typeof p === 'number' || typeof p === 'string')) position = { kind: 'point', x: positionRaw[0] as string | number, y: positionRaw[1] as string | number }
  else if (isObj(positionRaw) && ['left', 'right', 'top', 'bottom'].some((k) => positionRaw[k] !== undefined)) {
    const x = positionRaw['left'] ?? (positionRaw['right'] !== undefined ? `r:${String(positionRaw['right'])}` : 0)
    const y = positionRaw['top'] ?? (positionRaw['bottom'] !== undefined ? `b:${String(positionRaw['bottom'])}` : 0)
    position = { kind: 'point', x: x as string | number, y: y as string | number }
  } else if (positionRaw !== undefined) {
    // ledger: invalid-input
    warn('series-option-unsupported', 'tooltip.position', 'tooltip.position takes a side name, [x, y], a {left/top/right/bottom} box or a function; the tooltip follows the pointer.')
  }

  const ap = isObj(t['axisPointer']) ? t['axisPointer'] : {}
  for (const key of Object.keys(ap)) {
    // ledger: coordinates.axis-pointer
    if (!AXIS_POINTER_KEYS.has(key)) warn('option-key-unsupported', `tooltip.axisPointer.${key}`, `"tooltip.axisPointer.${key}" has no mapping yet; it was ignored.`)
  }
  const apType: AxisPointerType =
    ap['type'] === 'line' || ap['type'] === 'shadow' || ap['type'] === 'cross' || ap['type'] === 'none' ? ap['type'] : trigger === 'axis' ? 'line' : 'none'
  const lineStyle = isObj(ap['lineStyle']) ? ap['lineStyle'] : isObj(ap['crossStyle']) ? ap['crossStyle'] : {}
  const shadowStyle = isObj(ap['shadowStyle']) ? ap['shadowStyle'] : {}
  const label = isObj(ap['label']) ? ap['label']['show'] !== false : apType === 'cross'

  const text = isObj(t['textStyle']) ? t['textStyle'] : {}
  const css: string[] = []
  const bg = str(t['backgroundColor'])
  if (bg !== undefined) css.push(`background:${bg}`)
  const bc = str(t['borderColor'])
  if (bc !== undefined) css.push(`border-color:${bc}`)
  const bw = num(t['borderWidth'])
  if (bw !== undefined) css.push(`border-width:${bw}px`, 'border-style:solid')
  const br = num(t['borderRadius'])
  if (br !== undefined) css.push(`border-radius:${br}px`)
  const pad = paddingCss(t['padding'])
  if (pad !== undefined) css.push(`padding:${pad}`)
  const color = str(text['color'])
  if (color !== undefined) css.push(`color:${color}`)
  const fs = num(text['fontSize'])
  if (fs !== undefined) css.push(`font-size:${fs}px`)
  const fw = text['fontWeight']
  if (typeof fw === 'string' || typeof fw === 'number') css.push(`font-weight:${fw}`)
  const ff = str(text['fontFamily'])
  if (ff !== undefined) css.push(`font-family:${ff}`)
  const fst = str(text['fontStyle'])
  if (fst !== undefined) css.push(`font-style:${fst}`)
  const lh = num(text['lineHeight'])
  if (lh !== undefined) css.push(`line-height:${lh}px`)
  const shadowColor = str(t['shadowColor'])
  if (shadowColor !== undefined || num(t['shadowBlur']) !== undefined) {
    css.push(`box-shadow:${num(t['shadowOffsetX']) ?? 0}px ${num(t['shadowOffsetY']) ?? 0}px ${num(t['shadowBlur']) ?? 10}px ${shadowColor ?? 'rgba(0,0,0,0.2)'}`)
  }
  const extra = str(t['extraCssText'])
  if (extra !== undefined) css.push(extra)

  const order = t['order'] === 'seriesDesc' || t['order'] === 'valueAsc' || t['order'] === 'valueDesc' ? t['order'] : 'seriesAsc'

  return {
    show: t['show'] !== false,
    showContent: t['showContent'] !== false,
    trigger,
    triggerOn: triggerOn as TooltipSpec['triggerOn'],
    formatter,
    valueFormatter,
    position,
    confine: t['confine'] === true,
    order: order as TooltipSpec['order'],
    enterable: t['enterable'] === true,
    alwaysShowContent: t['alwaysShowContent'] === true,
    showDelay: num(t['showDelay']) ?? 0.0,
    hideDelay: num(t['hideDelay']) ?? 100.0,
    transitionDuration: num(t['transitionDuration']) ?? 0.4,
    axisPointer: {
      type: apType,
      color: str(lineStyle['color']),
      width: num(lineStyle['width']),
      dashed: lineStyle['type'] === 'dashed' || lineStyle['type'] === 'dotted',
      shadowColor: str(shadowStyle['color']),
      label,
    },
    css: css.join(';'),
    className: str(t['className']),
  }
}
