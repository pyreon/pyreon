// A compiled family plan → the family's OWN canvas host, so an ECharts option
// for a pie / sankey / treemap / … gets the same interactive host a hand-written
// `<PieChart>` gets (hit-testing, reactive repaint, accessible table) instead of
// a static picture. Pure: plan in, VNode out (or null for the two families that
// have no host yet — they fall back to the facade's SVG).

import { h } from '@pyreon/core'
import { computed } from '@pyreon/reactivity'
import { paletteAt } from './palette'
import type { VNode } from '@pyreon/core'
import type { FamilyPlan } from './option-family'
import { GaugeChart, PieChart } from './PieChart'
import { RadarChart } from './RadarChart'
import { CandlestickChart } from './CandlestickChart'
import { HeatmapChart } from './HeatmapChart'
import { FunnelChart } from './FunnelChart'
import { TreemapChart } from './TreemapChart'
import { SunburstChart } from './SunburstChart'
import { TreeChart } from './TreeChart'
import { ChordChart } from './ChordChart'
import { SankeyChart } from './SankeyChart'
import { GraphChart } from './GraphChart'
import { CalendarChart } from './CalendarChart'
import { ParallelChart } from './ParallelChart'
import { PolarChart } from './PolarChart'
import { RiverChart } from './RiverChart'
import { MapChart } from './MapChart'
import type { Double } from './types'
import type { ChartAnimation } from './animation-option'
import { ease } from './easing'
import type { ChartTheme } from './render'


export interface FamilyHostOptions {
  width: Double
  height: Double
  /** The host's own hit value, tagged with the family kind. */
  onSelect?: ((kind: FamilyPlan['kind'], hit: unknown) => void) | undefined
  /** The option's animation (ECharts' `animation*` keys); absent = the host's own defaults. */
  animation?: ChartAnimation | undefined
  /**
   * Paint no background: the host is a LAYER drawn over another chart (a pie
   * in the corner of a line chart), whose own canvas already paints the ground.
   */
  transparent?: boolean | undefined
  /**
   * Host props an option chart forwards beyond the plan — its tooltip switch,
   * keyboard, accessible table, `rtl` and toolbox, and the item hooks that
   * apply the option's `tooltip` / `cursor` / `silent`. A live-getter object:
   * it is read inside the host's props computation, so a change re-applies.
   */
  host?: Record<string, unknown> | undefined
  /**
   * The theme the option chart resolved (its `theme` prop, a provider, or
   * ECharts' default) — the family paints under it, as the cartesian half of
   * the same option chart does. Absent, the family host's context applies.
   */
  theme?: Partial<ChartTheme> | undefined
}

/** A resolved animation as canvas-host props. */
function animationProps(a: ChartAnimation | undefined): Record<string, unknown> {
  if (a === undefined) return {}
  return {
    animate: a.enter,
    updateAnimation: a.update,
    enterDuration: a.enterMs,
    enterDelay: a.enterDelay,
    updateDuration: a.updateMs,
    updateDelay: a.updateDelay,
    enterEasing: (t: Double) => ease(a.enterEasing, t),
    updateEasing: (t: Double) => ease(a.updateEasing, t),
  }
}

type Named = { name: string; color: string | undefined }
const colorOf = (rows: Named[]): ((d: Named, i: number) => string) | undefined =>
  rows.some((r) => r.color !== undefined) ? (d, i) => d.color ?? paletteAt([], i) : undefined

/**
 * The family host for a plan, or null when the family renders through the
 * facade's SVG only.
 *
 * Given an ACCESSOR, the node stays live: its props are getters over the
 * current plan, so a caller that keeps the node mounted across option updates
 * gets the host's own update tween instead of a remount that replays the
 * entrance. The props' KEY SET is fixed by the first plan — `familyHostShape`
 * says when a new plan needs a fresh node instead.
 */
export function familyHostNode(plan: FamilyPlan | (() => FamilyPlan), o: FamilyHostOptions): VNode | null {
  if (typeof plan !== 'function') return familyHostFor(plan, o)
  const first = familyHostFor(plan(), o)
  if (first === null) return null
  const current = computed(() => familyHostFor(plan(), o))
  const props: Record<string, unknown> = {}
  for (const key of Object.keys(first.props as Record<string, unknown>)) {
    Object.defineProperty(props, key, {
      get: () => (current()?.props as Record<string, unknown> | undefined)?.[key],
      enumerable: true,
      configurable: true,
    })
  }
  return { ...first, props }
}

/**
 * What a plan's host looks like — its component and prop keys. Two plans with
 * the same shape can share one live node; a different shape needs a new one.
 */
export function familyHostShape(plan: FamilyPlan, o: FamilyHostOptions): string | null {
  const node = familyHostFor(plan, o)
  if (node === null) return null
  const type = node.type as { name?: string }
  return `${plan.kind}:${type.name ?? ''}:${Object.keys(node.props as Record<string, unknown>).sort().join(',')}`
}

function familyHostFor(plan: FamilyPlan, o: FamilyHostOptions): VNode | null {
  const size = { width: o.width, height: o.height }
  const themed = o.theme === undefined ? (o.transparent === true ? { background: '' } : undefined) : o.transparent === true ? { ...o.theme, background: '' } : o.theme
  const chrome = { ...(plan.title !== undefined ? { title: plan.title } : {}), ...animationProps(o.animation), ...(themed !== undefined ? { theme: themed } : {}), ...o.host }
  const sel = (kind: FamilyPlan['kind']) => (o.onSelect === undefined ? {} : { onSelect: (hit: unknown) => o.onSelect!(kind, hit) })
  switch (plan.kind) {
    case 'pie': {
      const color = colorOf(plan.rows)
      return h(PieChart, { data: plan.rows, value: (r: { value: Double }) => r.value, label: (r: { name: string }) => r.name, ...(color !== undefined ? { color } : {}), innerRadius: plan.innerRadius, showLabels: plan.showLabels, showLegend: plan.showLegend, pie: plan.pie, ...size, ...chrome, ...sel('pie') })
    }
    case 'gauge':
      return h(GaugeChart, { value: plan.value, min: plan.min, max: plan.max, showValue: plan.showValue, dial: plan.dial, ...(plan.thickness !== undefined ? { thickness: plan.thickness } : {}), ...(plan.valueColor !== undefined ? { valueColor: plan.valueColor } : {}), ...size, ...chrome })
    case 'radar': {
      const color = colorOf(plan.rows)
      return h(RadarChart, { data: plan.rows, axes: plan.axes, values: (r: { values: Double[] }) => r.values, label: (r: { name: string }) => r.name, ...(color !== undefined ? { color } : {}), fillAlpha: plan.fillAlpha, showLegend: plan.showLegend, ...size, ...chrome })
    }
    case 'candlestick':
      return h(CandlestickChart, {
        data: plan.rows,
        open: (r: { open: Double }) => r.open,
        high: (r: { high: Double }) => r.high,
        low: (r: { low: Double }) => r.low,
        close: (r: { close: Double }) => r.close,
        x: (r: { x: string }) => r.x,
        candle: { ...(plan.upColor !== undefined ? { upColor: plan.upColor } : {}), ...(plan.downColor !== undefined ? { downColor: plan.downColor } : {}) },
        ...size,
        ...chrome,
        ...sel('candlestick'),
      })
    case 'heatmap':
      return h(HeatmapChart, { data: plan.rows, x: (r: { x: string }) => r.x, y: (r: { y: string }) => r.y, value: (r: { value: Double }) => r.value, ...(plan.colors !== undefined ? { colors: plan.colors } : {}), ...(plan.visualMap !== undefined ? { visualMap: plan.visualMap } : {}), ...size, ...chrome, ...sel('heatmap') })
    case 'funnel': {
      const color = colorOf(plan.rows)
      return h(FunnelChart, { data: plan.rows, value: (r: { value: Double }) => r.value, label: (r: { name: string }) => r.name, ...(color !== undefined ? { color } : {}), funnel: plan.funnel, ...size, ...chrome, ...sel('funnel') })
    }
    case 'treemap':
      return h(TreemapChart, { data: plan.nodes, treemap: plan.treemap, ...size, ...chrome, ...sel('treemap') })
    case 'sunburst':
      return h(SunburstChart, { data: plan.nodes, innerRatio: plan.innerRatio, sunburst: plan.sunburst, ...size, ...chrome, ...sel('sunburst') })
    case 'tree':
      return h(TreeChart, { data: plan.nodes, tree: plan.tree, ...size, ...chrome, ...sel('tree') })
    case 'sankey':
      return h(SankeyChart, { nodes: plan.nodes, links: plan.links, sankey: plan.sankey, ...(plan.orient === undefined ? {} : { orient: plan.orient }), ...size, ...chrome, ...sel('sankey') })
    case 'graph':
      return h(GraphChart, { nodes: plan.nodes, links: plan.links, graph: plan.graph, ...size, ...chrome, ...sel('graph') })
    case 'chord':
      return h(ChordChart, { nodes: plan.nodes, links: plan.links, chord: plan.chord, ...size, ...chrome, ...sel('chord') })
    case 'calendar':
      return h(CalendarChart, { start: plan.start, end: plan.end, values: plan.values, calendar: plan.calendar, ...(plan.orient === undefined ? {} : { orient: plan.orient }), ...(plan.visualMap !== undefined ? { visualMap: plan.visualMap } : {}), ...size, ...chrome, ...sel('calendar') })
    case 'parallel':
      return h(ParallelChart, { axes: plan.axes, rows: plan.rows, parallel: plan.parallel, ...(plan.orient === undefined ? {} : { orient: plan.orient }), ...size, ...chrome, ...sel('parallel') })
    case 'polar':
      return h(PolarChart, { axes: plan.axes, series: plan.series, polar: plan.polar, ...size, ...chrome, ...sel('polar') })
    case 'themeRiver':
      return h(RiverChart, { series: plan.series, river: plan.river, ...size, ...chrome, ...sel('themeRiver') })
    case 'map':
      return h(MapChart, { map: plan.geo, values: plan.values, options: plan.options, roam: plan.roam, scaleLimit: plan.scaleLimit, ...(plan.visualMap !== undefined ? { visualMap: plan.visualMap } : {}), ...size, ...chrome, ...sel('map') })
    // Scatter / lines on a geo: the map with the points and paths as its overlays, so it roams too.
    case 'geoPoints':
      return h(MapChart, {
        map: plan.geo,
        values: plan.values,
        options: plan.map,
        points: plan.points,
        heat: plan.heat,
        heatRadius: plan.heatRadius,
        ...(plan.heatStops.length > 0 ? { heatStops: plan.heatStops } : {}),
        pies: plan.pies,
        ...(plan.trail === undefined ? {} : { trail: plan.trail }),
        paths: plan.paths.map((p) => ({ coords: p.coords.map(([lon, lat]) => ({ lon, lat })), ...(p.color === undefined ? {} : { color: p.color }), ...(p.width === undefined ? {} : { width: p.width }) })),
        overlayOptions: plan.options,
        roam: plan.roam,
        scaleLimit: plan.scaleLimit,
        ...size,
        ...chrome,
        ...sel('geoPoints'),
      })
    // Renders through the facade's SVG only. boxplot is here for a concrete
    // reason rather than an omission: the plan carries rows that are ALREADY
    // five-number summaries (option-family feeds them straight to
    // `boxplotToSvg`), while `BoxplotChart` takes raw observations and
    // summarises them itself — there is no way to hand it a summary without a
    // new prop. Giving the canvas host a summaries path is a component API
    // change, so it is a follow-up rather than something to slip into a
    // batch merge; until then a boxplot option renders as static SVG, which
    // is what it did before this switch became exhaustive over it.
    case 'boxplot':
    case 'singleAxis':
      return null
  }
}
