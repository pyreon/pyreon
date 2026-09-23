/**
 * ECharts' funnel keys read into the engine's `FunnelEcConfig`: how the stages
 * are sized and stacked (`orient`, `sort`, `min` / `max`, `minSize` /
 * `maxSize`, `gap`, `funnelAlign`, per-item `itemStyle.width` / `height`), how
 * they are bordered (`itemStyle.borderColor` / `borderWidth`) and labelled
 * (`label`, `labelLine`). The box itself (`left` / `top` / `right` / `bottom`
 * / `width` / `height`) is the series frame (`familyFrame`).
 */
import type { FunnelEcConfig } from './funnel'
import { formatTooltipTemplate } from './tooltip-format'
import type { Double } from './types'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** A funnel stage as the reader sees it. */
export interface FunnelRow {
  value: Double
  name: string
  color: string | undefined
}

/** A length ECharts writes as pixels or a percent of the view: [amount, isFraction]. */
function sizeOf(v: unknown, fallback: [Double, boolean]): [Double, boolean] {
  if (typeof v === 'number' && Number.isFinite(v)) return [v, false]
  if (typeof v === 'string') {
    const t = v.trim()
    if (t.endsWith('%')) {
      const n = Number.parseFloat(t)
      return Number.isFinite(n) ? [n / 100.0, true] : fallback
    }
    const n = Number.parseFloat(t)
    if (Number.isFinite(n)) return [n, false]
  }
  return fallback
}

/** ECharts' funnel `percent`: the stage's share of the sum, to 2 decimals; 0 when the sum is. */
export function funnelPercent(rows: FunnelRow[], i: number): Double {
  let sum = 0.0
  for (const r of rows) sum += r.value
  if (sum === 0 || !Number.isFinite(sum)) return 0
  return Number(((rows[i]!.value / sum) * 100).toFixed(2))
}

/**
 * The funnel as ECharts lays it out and labels it. `rawData` is the series'
 * own data, index-aligned with `rows`, for per-item sizes and a function
 * formatter's `params.data`.
 */
export function readFunnelEc(s: Obj, rows: FunnelRow[], rawData: unknown[]): FunnelEcConfig {
  const orient = s['orient'] === 'horizontal' ? 'horizontal' : 'vertical'
  const sortRaw = s['sort']
  const sort = sortRaw === 'ascending' ? 'ascending' : sortRaw === 'none' ? 'none' : 'descending'
  const [minSize, minSizePct] = sizeOf(s['minSize'], [0.0, true])
  const [maxSize, maxSizePct] = sizeOf(s['maxSize'], [1.0, true])
  const alignRaw = s['funnelAlign']
  const align = typeof alignRaw === 'string' && ['left', 'right', 'top', 'bottom', 'center'].includes(alignRaw) ? alignRaw : 'center'
  const sizeKey = orient === 'horizontal' ? 'width' : 'height'
  const itemSizes: Double[] = []
  const itemSizesPct: boolean[] = []
  for (let i = 0; i < rows.length; i++) {
    const d = rawData[i]
    const style = isObj(d) && isObj(d['itemStyle']) ? d['itemStyle'] : {}
    const [v, p] = sizeOf(style[sizeKey], [Number.NaN, false])
    itemSizes.push(v)
    itemSizesPct.push(p)
  }
  const label = isObj(s['label']) ? s['label'] : {}
  const line = isObj(s['labelLine']) ? s['labelLine'] : {}
  const itemStyle = isObj(s['itemStyle']) ? s['itemStyle'] : {}
  const f = label['formatter']
  const seriesName = typeof s['name'] === 'string' ? s['name'] : ''
  const labelTexts = rows.map((r, i) => {
    const percent = funnelPercent(rows, i)
    if (typeof f === 'function') {
      const out = (f as (p: Obj) => unknown)({
        componentType: 'series',
        componentSubType: 'funnel',
        seriesType: 'funnel',
        seriesIndex: 0,
        seriesName,
        name: r.name,
        dataIndex: i,
        data: rawData[i],
        value: r.value,
        percent,
        color: r.color,
        status: 'normal',
      })
      return out === undefined || out === null ? '' : String(out)
    }
    const tpl = typeof f === 'string' ? f : '{b}'
    return formatTooltipTemplate(tpl, [{ seriesName, name: r.name, value: String(r.value), percent: String(percent), values: [], color: r.color ?? '' }])
  })
  const pos = label['position']
  return {
    orient,
    sort,
    min: num(s['min']) ?? Number.NaN,
    max: num(s['max']) ?? Number.NaN,
    minSize,
    minSizePct,
    maxSize,
    maxSizePct,
    gap: num(s['gap']) ?? 0.0,
    align,
    itemSizes,
    itemSizesPct,
    labelShow: label['show'] !== false,
    labelPosition: typeof pos === 'string' ? pos : 'outer',
    labelLineShow: line['show'] !== false,
    labelLineLength: num(line['length']) ?? 20.0,
    labelColor: typeof label['color'] === 'string' ? (label['color'] as string) : '',
    labelFontSize: num(label['fontSize']) ?? 12.0,
    labelTexts,
    borderColor: typeof itemStyle['borderColor'] === 'string' ? (itemStyle['borderColor'] as string) : '',
    borderWidth: num(itemStyle['borderWidth']) ?? 1.0,
  }
}
