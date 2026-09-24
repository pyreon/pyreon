/**
 * An ECharts treemap series read into the engine's `TreemapEcNode` tree and
 * `TreemapEcConfig`. Every node's layout styling resolves the way ECharts'
 * tree model does: the datum's own option, then `levels[depth]` (the series
 * root is depth 0, a top-level datum depth 1), then the series.
 */
import type { TreemapEcConfig, TreemapEcNode } from './treemap'
import type { Double } from './types'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** The first of `sources` whose `path` holds a finite number. */
function pick(sources: Obj[], path: string[]): number | undefined {
  for (const src of sources) {
    let cur: unknown = src
    for (const k of path) cur = isObj(cur) ? cur[k] : undefined
    const n = num(cur)
    if (n !== undefined) return n
  }
  return undefined
}
/** The first of `sources` whose `path` holds a boolean. */
function pickBool(sources: Obj[], path: string[]): boolean | undefined {
  for (const src of sources) {
    let cur: unknown = src
    for (const k of path) cur = isObj(cur) ? cur[k] : undefined
    if (typeof cur === 'boolean') return cur
  }
  return undefined
}

/** A datum's value, ECharts' way: a number, or the first of an array. */
function ownValue(d: Obj): number | undefined {
  const v = d['value']
  return Array.isArray(v) ? num(v[0]) : num(v)
}

/**
 * The series' tree for `layoutTreemapEc`. A node carries its own
 * `itemStyle.color`, or '' — the palette (top level) or its parent's colour
 * (below), resolved at layout where the palette is known.
 */
/** An ECharts treemap, read: the tree, the layout config, and how it is painted. */
export interface TreemapEc {
  root: TreemapEcNode
  cfg: TreemapEcConfig
  /** A parent's background; '' = the chart's. */
  borderColor: string
  labelColor: string
  fontSize: Double
  showLabels: boolean
}

export function readTreemapEc(s: Obj, data: unknown[]): TreemapEc {
  const levels: Obj[] = Array.isArray(s['levels']) ? (s['levels'] as unknown[]).map((l) => (isObj(l) ? l : {})) : []
  const style = (own: Obj, depth: number) => {
    const sources = [own, levels[depth] ?? {}, s]
    const upperShow = pickBool(sources, ['upperLabel', 'show']) ?? false
    return {
      borderWidth: pick(sources, ['itemStyle', 'borderWidth']) ?? 0.0,
      gapWidth: pick(sources, ['itemStyle', 'gapWidth']) ?? 0.0,
      upperLabelHeight: upperShow ? pick(sources, ['upperLabel', 'height']) ?? 20.0 : 0.0,
      visibleMin: pick(sources, ['visibleMin']) ?? 10.0,
      childrenVisibleMin: pick(sources, ['childrenVisibleMin']) ?? Number.NaN,
    }
  }
  const build = (d: unknown, i: number, depth: number): TreemapEcNode | null => {
    if (!isObj(d)) return null
    const own = d
    const item = isObj(own['itemStyle']) ? own['itemStyle'] : {}
    const color = typeof item['color'] === 'string' ? (item['color'] as string) : ''
    const kidsRaw = Array.isArray(own['children']) ? (own['children'] as unknown[]) : []
    const children: TreemapEcNode[] = []
    kidsRaw.forEach((c, j) => {
      const n = build(c, j, depth + 1)
      if (n !== null) children.push(n)
    })
    // ECharts' `completeTreeValue`: a parent without a value sums its children; never below zero.
    let sum = 0.0
    for (const c of children) sum += c.value
    const v = ownValue(own) ?? sum
    return {
      name: typeof own['name'] === 'string' ? (own['name'] as string) : 'Node ' + String(i + 1),
      value: v < 0 ? 0.0 : v,
      color,
      children,
      ...style(own, depth),
    }
  }
  const top: TreemapEcNode[] = []
  data.forEach((d, i) => {
    const n = build(d, i, 1)
    if (n !== null) top.push(n)
  })
  let sum = 0.0
  for (const c of top) sum += c.value
  const root: TreemapEcNode = { name: typeof s['name'] === 'string' ? (s['name'] as string) : '', value: sum, color: '', children: top, ...style({}, 0) }
  const sortRaw = s['sort']
  // ECharts sorts unless `sort` is falsy; any other value but 'asc' means 'desc' (even 'none').
  const sort = sortRaw === 'asc' ? 'asc' : sortRaw === false || sortRaw === null ? '' : 'desc'
  const ratio: Double = num(s['squareRatio']) ?? 0.5 * (1 + Math.sqrt(5))
  const leafDepth = num(s['leafDepth'])
  const itemStyle = isObj(s['itemStyle']) ? s['itemStyle'] : {}
  const level0 = levels[0] ?? {}
  const level0Style = isObj(level0['itemStyle']) ? level0['itemStyle'] : {}
  const label = isObj(s['label']) ? s['label'] : {}
  return {
    root,
    cfg: { squareRatio: ratio, sort, leafDepth: leafDepth ?? Number.NaN },
    // A parent's background (ECharts' `itemStyle.borderColor`, white by default); '' = the chart's background.
    borderColor: typeof level0Style['borderColor'] === 'string' ? (level0Style['borderColor'] as string) : typeof itemStyle['borderColor'] === 'string' ? (itemStyle['borderColor'] as string) : '',
    labelColor: typeof label['color'] === 'string' ? (label['color'] as string) : '#ffffff',
    fontSize: num(label['fontSize']) ?? 12.0,
    showLabels: label['show'] !== false,
  }
}
