/**
 * ECharts' legend on an option chart: which entries it shows (`legend.data`),
 * which start off (`legend.selected`), how a click toggles them
 * (`legend.selectedMode`), and what a hidden entry does to the series.
 *
 * Everything is keyed by NAME, as ECharts keys it: an entry toggles every
 * series of that name.
 */
import type { LegendEntry } from './legend'
import { hideHiddenSeries } from './legend-toggle'
import type { Series } from './render'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** ECharts' `legend.selectedMode`: toggle freely, keep one on, or clicks do nothing. */
export type LegendSelectedMode = 'multiple' | 'single' | false

export interface OptionLegend {
  entries: LegendEntry[]
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
  return { entries: [...new Set(names)].map((label) => ({ label, color: colorOf.get(label)! })), selectedMode, hidden }
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
