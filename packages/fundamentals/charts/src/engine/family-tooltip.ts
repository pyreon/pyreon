/**
 * ECharts' `tooltip` component, and a series' own `tooltip` / `cursor` /
 * `silent`, applied to a FAMILY host (pie, sankey, treemap, …).
 *
 * The family reports the item under the pointer as a `HostItem`; this module
 * turns it into what the option asks for — the same `readTooltipOption` spec,
 * template syntax, placement and look the cartesian path uses, so a
 * `tooltip.formatter` written for a pie reads the way ECharts reads it.
 */
import type { CanvasHostProps, HostItem, TooltipView } from './canvas-host'
import type { FamilyPlan } from './option-family'
import { readTooltipOption } from './option-tooltip'
import { formatTooltipTemplate, tooltipBreaks, tooltipMarker } from './tooltip-format'
import type { TooltipEntry } from './tooltip-format'
import { tooltipPlace } from './tooltip-place'
import { paletteAt } from './palette'
import { plain } from './format'
import type { Double } from './types'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined ? [] : [v])

/**
 * Families whose items ARE the option's `data` entries, in order — for them a
 * formatter's `params.data` is the author's own datum. The tree-shaped and
 * graph-shaped families lay their items out in their own order, so they omit it.
 */
const DATA_IS_ITEMS: ReadonlySet<string> = new Set(['pie', 'funnel', 'gauge', 'candlestick', 'heatmap', 'radar', 'parallel'])

/** Families an axis-triggered tooltip applies to (they have a category axis); the rest show nothing for `trigger: 'axis'`, as ECharts. */
const AXIS_FAMILIES: ReadonlySet<string> = new Set(['polar', 'themeRiver'])

export interface FamilyTooltipInputs {
  /** The option the family was compiled from (`CompiledFamily.source`). */
  option: () => Obj
  kind: () => FamilyPlan['kind']
  /** `<OptionChart tooltip>`: false turns every box off; true keeps the family's own box when the option has no tooltip component. */
  tooltipProp: () => boolean | undefined
  /** The host's size, which a percent `position` is taken of. */
  size: () => { w: Double; h: Double }
}

const seriesOf = (option: Obj, item: HostItem): Obj | undefined => {
  const s = asArray(option['series'])[item.seriesIndex]
  return isObj(s) ? s : undefined
}

/** A value as the default content shows it: numbers plainly, an array item by item. */
function shown(v: unknown): string {
  if (typeof v === 'number') return Number.isFinite(v) ? plain(v) : '-'
  if (Array.isArray(v)) return v.map(shown).join(', ')
  return v === undefined || v === null ? '-' : String(v)
}

/** The `itemTooltip` a family host gets for an option. */
export function familyItemTooltip(inputs: FamilyTooltipInputs): (item: HostItem, lines: string[], press: boolean) => string[] | TooltipView | null {
  return (item, lines, press) => {
    const option = inputs.option()
    const series = seriesOf(option, item)
    const globalTip = option['tooltip']
    const ownTip = series?.['tooltip']
    // No tooltip component anywhere: ECharts shows nothing; the prop alone keeps the family's own box.
    if (globalTip === undefined && ownTip === undefined) return inputs.tooltipProp() === true && lines.length > 0 ? lines : null
    if (inputs.tooltipProp() === false) return null
    // A series' own `tooltip` refines the global one for its items.
    const merged = isObj(ownTip) && (globalTip === undefined || isObj(globalTip)) ? { ...(globalTip as Obj | undefined), ...ownTip } : ownTip ?? globalTip
    const spec = readTooltipOption(merged, () => undefined)
    if (spec === null || !spec.show || !spec.showContent || spec.trigger === 'none') return null
    if (spec.triggerOn === 'none' || (spec.triggerOn === 'click' && !press)) return null
    if (spec.trigger === 'axis' && !AXIS_FAMILIES.has(inputs.kind())) return null
    const seriesName = item.seriesName ?? (typeof series?.['name'] === 'string' ? (series['name'] as string) : '')
    const color = item.color ?? paletteAt([], item.dataIndex)
    const value = spec.valueFormatter === undefined ? shown(item.value) : String(spec.valueFormatter(item.value, item.dataIndex))
    const percent = item.percent === undefined ? '' : plain(item.percent)
    const data = DATA_IS_ITEMS.has(inputs.kind()) ? asArray(series?.['data'])[item.dataIndex] : undefined
    const params: Obj = {
      componentType: 'series',
      componentSubType: series?.['type'],
      seriesType: series?.['type'],
      seriesIndex: item.seriesIndex,
      seriesName,
      name: item.name,
      dataIndex: item.dataIndex,
      data,
      value: item.value,
      color,
      marker: tooltipMarker(color),
      ...(item.percent === undefined ? {} : { percent: item.percent }),
      ...(item.dataType === undefined ? {} : { dataType: item.dataType }),
    }
    const entry: TooltipEntry = {
      seriesName,
      name: item.name,
      value,
      percent,
      values: Array.isArray(item.value) ? item.value.map(shown) : [],
      color,
    }
    const view: TooltipView = {
      place: tooltipPlace(spec, null, params, inputs.size()),
      confine: spec.confine || spec.position.kind === 'follow',
      css: spec.css,
      className: spec.className,
      enterable: spec.enterable,
      hideDelay: spec.hideDelay,
      keepOnLeave: spec.alwaysShowContent,
      transition: spec.transitionDuration,
    }
    const f = spec.formatter
    if (typeof f === 'string') return { ...view, html: tooltipBreaks(formatTooltipTemplate(f, [entry])).split('\n').join('<br/>') }
    if (typeof f === 'function') {
      const out = f(params)
      return { ...view, html: typeof out === 'string' ? out : String(out ?? '') }
    }
    // The family's own lines, unless a valueFormatter asks for the value re-shown.
    if (lines.length > 0 && spec.valueFormatter === undefined) return { ...view, lines }
    const main = `${item.name}: ${value}${percent === '' ? '' : ` (${percent}%)`}`
    return { ...view, lines: seriesName === '' ? [main] : [seriesName, main] }
  }
}

/** ECharts' per-series `cursor` over an item; 'pointer' is its default. */
export function familyItemCursor(option: () => Obj): (item: HostItem) => string {
  return (item) => {
    const c = seriesOf(option(), item)?.['cursor']
    return typeof c === 'string' ? c : 'pointer'
  }
}

/** ECharts' `silent`: the series ignores the pointer. */
export function familyItemSilent(option: () => Obj): (item: HostItem) => boolean {
  return (item) => seriesOf(option(), item)?.['silent'] === true
}

/** The host props an option-driven family host carries beyond its plan. */
export type FamilyHostExtras = Pick<CanvasHostProps, 'itemTooltip' | 'itemCursor' | 'itemSilent'>
