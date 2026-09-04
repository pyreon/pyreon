// A compiled family plan → the family's OWN canvas host, so an ECharts option
// for a pie / sankey / treemap / … gets the same interactive host a hand-written
// `<PieChart>` gets (hit-testing, reactive repaint, accessible table) instead of
// a static picture. Pure: plan in, VNode out (or null for the two families that
// have no host yet — they fall back to the facade's SVG).

import { h } from '@pyreon/core'
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
import { SankeyChart } from './SankeyChart'
import { GraphChart } from './GraphChart'
import { CalendarChart } from './CalendarChart'
import { ParallelChart } from './ParallelChart'
import { PolarChart } from './PolarChart'
import { RiverChart } from './RiverChart'
import { MapChart } from './MapChart'
import type { Double } from './types'

const PALETTE = ['#0f766e', '#b45309', '#1d4ed8', '#b42318', '#15803d', '#7c3aed']

export interface FamilyHostOptions {
  width: Double
  height: Double
  /** The host's own hit value, tagged with the family kind. */
  onSelect?: ((kind: FamilyPlan['kind'], hit: unknown) => void) | undefined
}

type Named = { name: string; color: string | undefined }
const colorOf = (rows: Named[]): ((d: Named, i: number) => string) | undefined =>
  rows.some((r) => r.color !== undefined) ? (d, i) => d.color ?? PALETTE[i % PALETTE.length]! : undefined

/** The family host for a plan, or null when the family renders through the facade's SVG only. */
export function familyHostNode(plan: FamilyPlan, o: FamilyHostOptions): VNode | null {
  const size = { width: o.width, height: o.height }
  const title = plan.title !== undefined ? { title: plan.title } : {}
  const sel = (kind: FamilyPlan['kind']) => (o.onSelect === undefined ? {} : { onSelect: (hit: unknown) => o.onSelect!(kind, hit) })
  switch (plan.kind) {
    case 'pie': {
      const color = colorOf(plan.rows)
      return h(PieChart, { data: plan.rows, value: (r: { value: Double }) => r.value, label: (r: { name: string }) => r.name, ...(color !== undefined ? { color } : {}), innerRadius: plan.innerRadius, showLabels: plan.showLabels, showLegend: plan.showLegend, ...size, ...title, ...sel('pie') })
    }
    case 'gauge':
      return h(GaugeChart, { value: plan.value, min: plan.min, max: plan.max, showValue: plan.showValue, ...(plan.thickness !== undefined ? { thickness: plan.thickness } : {}), ...(plan.valueColor !== undefined ? { valueColor: plan.valueColor } : {}), ...size, ...title })
    case 'radar': {
      const color = colorOf(plan.rows)
      return h(RadarChart, { data: plan.rows, axes: plan.axes, values: (r: { values: Double[] }) => r.values, label: (r: { name: string }) => r.name, ...(color !== undefined ? { color } : {}), fillAlpha: plan.fillAlpha, showLegend: plan.showLegend, ...size, ...title })
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
        ...title,
        ...sel('candlestick'),
      })
    case 'heatmap':
      return h(HeatmapChart, { data: plan.rows, x: (r: { x: string }) => r.x, y: (r: { y: string }) => r.y, value: (r: { value: Double }) => r.value, ...(plan.colors !== undefined ? { colors: plan.colors } : {}), ...size, ...title, ...sel('heatmap') })
    case 'funnel': {
      const color = colorOf(plan.rows)
      return h(FunnelChart, { data: plan.rows, value: (r: { value: Double }) => r.value, label: (r: { name: string }) => r.name, ...(color !== undefined ? { color } : {}), funnel: plan.funnel, ...size, ...title, ...sel('funnel') })
    }
    case 'treemap':
      return h(TreemapChart, { data: plan.nodes, treemap: plan.treemap, ...size, ...title, ...sel('treemap') })
    case 'sunburst':
      return h(SunburstChart, { data: plan.nodes, innerRatio: plan.innerRatio, sunburst: plan.sunburst, ...size, ...title, ...sel('sunburst') })
    case 'tree':
      return h(TreeChart, { data: plan.nodes, tree: plan.tree, ...size, ...title, ...sel('tree') })
    case 'sankey':
      return h(SankeyChart, { nodes: plan.nodes, links: plan.links, sankey: plan.sankey, ...size, ...title, ...sel('sankey') })
    case 'graph':
      return h(GraphChart, { nodes: plan.nodes, links: plan.links, graph: plan.graph, ...size, ...title, ...sel('graph') })
    case 'calendar':
      return h(CalendarChart, { start: plan.start, end: plan.end, values: plan.values, calendar: plan.calendar, ...size, ...title, ...sel('calendar') })
    case 'parallel':
      return h(ParallelChart, { axes: plan.axes, rows: plan.rows, parallel: plan.parallel, ...size, ...title, ...sel('parallel') })
    case 'polar':
      return h(PolarChart, { axes: plan.axes, series: plan.series, polar: plan.polar, ...size, ...title, ...sel('polar') })
    case 'themeRiver':
      return h(RiverChart, { series: plan.series, river: plan.river, ...size, ...title, ...sel('themeRiver') })
    case 'map':
      return h(MapChart, { map: plan.geo, values: plan.values, options: plan.options, ...size, ...title, ...sel('map') })
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
    case 'geoPoints':
    case 'singleAxis':
      return null
  }
}
