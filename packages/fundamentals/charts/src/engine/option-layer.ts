// Option-level layers shared by both facade halves: the `dataset` pre-pass
// (materialises series data from a shared source) and the `graphic` layer
// (free-form shapes appended after the chart).

import { renderSvg } from './svg'
import type { OptionWarning } from './option'
import type { Double, DrawCmd, Pt } from './types'

export type EChartsOptionLike = Record<string, unknown>

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export interface Table {
  /** Dimension names (header row or object keys). */
  dims: string[]
  /** Rows of cells, one array per record. */
  rows: unknown[][]
}

/** Read a dataset `source` into a dimension table, honouring `sourceHeader` and `dimensions`. */
export function readSource(ds: Record<string, unknown>): Table | null {
  const source = ds['source']
  if (!Array.isArray(source) || source.length === 0) return null
  const declared = Array.isArray(ds['dimensions']) ? (ds['dimensions'] as unknown[]).map((d) => (isObj(d) && typeof d['name'] === 'string' ? (d['name'] as string) : String(d))) : null
  if (isObj(source[0])) {
    const keys = declared ?? Array.from(new Set((source as Record<string, unknown>[]).flatMap((r) => Object.keys(r))))
    return { dims: keys, rows: (source as Record<string, unknown>[]).map((r) => keys.map((k) => r[k])) }
  }
  if (!Array.isArray(source[0])) return null
  const rowsRaw = source as unknown[][]
  const headerOpt = ds['sourceHeader']
  const firstRowIsText = rowsRaw[0]!.every((c) => typeof c === 'string')
  const hasHeader = headerOpt === true || headerOpt === 1 || (headerOpt === undefined && firstRowIsText && rowsRaw.length > 1 && !rowsRaw[1]!.every((c) => typeof c === 'string'))
  const dims = declared ?? (hasHeader ? rowsRaw[0]!.map((c) => String(c)) : rowsRaw[0]!.map((_, i) => 'dim' + String(i)))
  return { dims, rows: hasHeader ? rowsRaw.slice(1) : rowsRaw }
}

type Cond = Record<string, unknown>

function compareCells(a: unknown, b: unknown): number {
  const na = num(a)
  const nb = num(b)
  if (na !== null && nb !== null) return na - nb
  const sa = String(a ?? '')
  const sb = String(b ?? '')
  return sa < sb ? -1 : sa > sb ? 1 : 0
}

function evalCond(t: Table, cond: Cond, row: unknown[], warnings: OptionWarning[], path: string): boolean {
  if (Array.isArray(cond['and'])) return (cond['and'] as Cond[]).every((c) => evalCond(t, c, row, warnings, path))
  if (Array.isArray(cond['or'])) return (cond['or'] as Cond[]).some((c) => evalCond(t, c, row, warnings, path))
  if (isObj(cond['not'])) return !evalCond(t, cond['not'] as Cond, row, warnings, path)
  const di = dimIndex(t, cond['dimension'])
  if (di === null) {
    if (!warnings.some((w) => w.path === path + '.dimension')) warnings.push({ code: 'series-data-shape', path: path + '.dimension', message: 'Unknown dataset dimension "' + String(cond['dimension']) + '" in a transform; the condition was ignored.' })
    return true
  }
  const v = row[di]
  const ops: [string[], (c: number) => boolean][] = [
    [['gt', '>'], (c) => c > 0],
    [['gte', '>='], (c) => c >= 0],
    [['lt', '<'], (c) => c < 0],
    [['lte', '<='], (c) => c <= 0],
    [['eq', '='], (c) => c === 0],
    [['ne', '!='], (c) => c !== 0],
  ]
  for (const [keys, test] of ops) {
    for (const k of keys) {
      if (cond[k] === undefined) continue
      if (!test(compareCells(v, cond[k]))) return false
    }
  }
  return true
}

/** Apply a dataset's `transform` list (filter / sort) to a table; unknown kinds pass through with a warning. */
export function applyTransforms(t: Table, transforms: unknown[], warnings: OptionWarning[], path = 'dataset'): Table {
  let cur = t
  for (let i = 0; i < transforms.length; i++) {
    const tr = transforms[i]
    const tp = path + '.transform[' + String(i) + ']'
    if (!isObj(tr)) continue
    const cfg = tr['config']
    if (tr['type'] === 'filter') {
      const cond = isObj(cfg) ? (cfg as Cond) : {}
      cur = { dims: cur.dims, rows: cur.rows.filter((r) => evalCond(cur, cond, r, warnings, tp + '.config')) }
    } else if (tr['type'] === 'sort') {
      const keys = (Array.isArray(cfg) ? cfg : [cfg]).filter(isObj)
      const resolved = keys.map((k) => ({ di: dimIndex(cur, k['dimension']), desc: k['order'] === 'desc' }))
      for (let k = 0; k < resolved.length; k++) if (resolved[k]!.di === null) warnings.push({ code: 'series-data-shape', path: tp + '.config.dimension', message: 'Unknown dataset dimension "' + String(keys[k]!['dimension']) + '" in a sort; that key was ignored.' })
      const live = resolved.filter((r): r is { di: number; desc: boolean } => r.di !== null)
      const indexed = cur.rows.map((r, idx) => ({ r, idx }))
      indexed.sort((a, b) => {
        for (const key of live) {
          const c = compareCells(a.r[key.di], b.r[key.di])
          if (c !== 0) return key.desc ? -c : c
        }
        return a.idx - b.idx
      })
      cur = { dims: cur.dims, rows: indexed.map((x) => x.r) }
    } else {
      warnings.push({ code: 'option-key-unsupported', path: tp + '.type', message: 'dataset transform "' + String(tr['type']) + '" is not supported (filter and sort are); the table passed through unchanged.' })
    }
  }
  return cur
}

function transpose(t: Table): Table {
  // Rows become dimensions: the first cell of each row names it, and each
  // original column (after the first) becomes a record.
  const dims = [t.dims[0] ?? 'dim0', ...t.rows.map((r) => String(r[0] ?? ''))]
  const width = t.rows[0]?.length ?? 0
  const rows: unknown[][] = []
  for (let c = 1; c < width; c++) {
    const row: unknown[] = [t.dims[c] ?? 'dim' + String(c)]
    for (const r of t.rows) row.push(r[c])
    rows.push(row)
  }
  return { dims, rows }
}

function dimIndex(t: Table, ref: unknown): number | null {
  if (typeof ref === 'number') return ref >= 0 && ref < t.dims.length ? ref : null
  if (typeof ref === 'string') {
    const i = t.dims.indexOf(ref)
    return i >= 0 ? i : null
  }
  return null
}

const NAME_VALUE_TYPES = new Set(['pie', 'funnel', 'treemap', 'sunburst'])

/**
 * Materialise `series[].data` (and a category `xAxis.data`) from `dataset`.
 * Returns a NEW option; the input is never mutated. Series that already carry
 * `data` are left alone.
 */
export function resolveDataset(option: EChartsOptionLike): { option: EChartsOptionLike; warnings: OptionWarning[] } {
  const warnings: OptionWarning[] = []
  const dsRaw = option['dataset']
  if (dsRaw === undefined) return { option, warnings }
  const datasets = (Array.isArray(dsRaw) ? dsRaw : [dsRaw]).filter(isObj)
  // Datasets resolve in order so a derived one can build on an earlier one.
  const tables: (Table | null)[] = []
  for (let i = 0; i < datasets.length; i++) {
    const d = datasets[i]!
    const trRaw = d['transform']
    if (trRaw === undefined) {
      tables.push(readSource(d))
      continue
    }
    const from = num(d['fromDatasetIndex']) ?? 0
    const base = tables[from] ?? null
    if (base === null) {
      warnings.push({ code: 'series-data-shape', path: 'dataset[' + String(i) + '].fromDatasetIndex', message: 'The dataset to transform (index ' + String(from) + ') has no readable source; this dataset is empty.' })
      tables.push(null)
      continue
    }
    tables.push(applyTransforms(base, Array.isArray(trRaw) ? trRaw : [trRaw], warnings, 'dataset[' + String(i) + ']'))
  }
  const seriesArr = Array.isArray(option['series']) ? (option['series'] as unknown[]) : option['series'] === undefined ? [] : [option['series']]
  let xData: unknown[] | null = null
  // ECharts hands each series the NEXT unclaimed column of ITS dataset (a
  // per-dataset cursor), not column seriesIndex+1 — two series on two
  // datasets both read column 1.
  const cursor = new Map<number, number>()
  const nextColumn = (ds: number): number => {
    const n = (cursor.get(ds) ?? 0) + 1
    cursor.set(ds, n)
    return n
  }
  // The pre-pass CONSUMES the dataset keys it materialised, so the compilers see a plain series.
  const withData = (sr: Record<string, unknown>, data: unknown[]): Record<string, unknown> => {
    const o: Record<string, unknown> = { ...sr, data }
    delete o['datasetIndex']
    delete o['encode']
    delete o['seriesLayoutBy']
    return o
  }
  const outSeries = seriesArr.map((sRaw, si) => {
    if (!isObj(sRaw) || Array.isArray(sRaw['data'])) return sRaw
    const dsIndex = num(sRaw['datasetIndex']) ?? 0
    let t = tables[dsIndex] ?? null
    if (t === null) {
      warnings.push({ code: 'series-data-shape', path: 'series[' + String(si) + '].datasetIndex', message: 'No readable dataset source for this series; treated as empty.' })
      return sRaw
    }
    if (sRaw['seriesLayoutBy'] === 'row') t = transpose(t)
    const enc = isObj(sRaw['encode']) ? sRaw['encode'] : {}
    const type = typeof sRaw['type'] === 'string' ? (sRaw['type'] as string) : ''
    const col = (v: unknown[] | undefined | unknown, fallback: number): number | null => dimIndex(t!, Array.isArray(v) ? v[0] : v) ?? (fallback < t!.dims.length ? fallback : null)
    if (NAME_VALUE_TYPES.has(type)) {
      const nameCol = col(enc['itemName'], 0)
      const valueCol = col(enc['value'], enc['value'] === undefined ? nextColumn(dsIndex) : 0)
      if (nameCol === null || valueCol === null) return sRaw
      return withData(sRaw, t.rows.map((r) => ({ name: String(r[nameCol] ?? ''), value: num(r[valueCol]) ?? 0 })))
    }
    if (type === 'scatter') {
      const xCol = col(enc['x'], 0)
      const yCol = col(enc['y'], enc['y'] === undefined ? nextColumn(dsIndex) : 0)
      if (xCol === null || yCol === null) return sRaw
      return withData(sRaw, t.rows.map((r) => [num(r[xCol]) ?? 0, num(r[yCol]) ?? 0]))
    }
    const xCol = col(enc['x'], 0)
    const want = enc['y'] === undefined ? nextColumn(dsIndex) : 0
    const yCol = col(enc['y'], want)
    if (yCol === null) {
      warnings.push({ code: 'series-data-shape', path: 'series[' + String(si) + ']', message: 'The dataset has no dimension for this series (dimension ' + String(want) + '); treated as empty.' })
      return sRaw
    }
    if (xData === null && xCol !== null) xData = t.rows.map((r) => r[xCol])
    return withData(sRaw, t.rows.map((r) => num(r[yCol]) ?? null))
  })
  const out: EChartsOptionLike = { ...option, series: Array.isArray(option['series']) ? outSeries : outSeries[0] }
  const x = out['xAxis']
  const xObj = Array.isArray(x) ? x[0] : x
  if (xData !== null && (xObj === undefined || (isObj(xObj) && !Array.isArray(xObj['data'])))) {
    const base = isObj(xObj) ? xObj : {}
    const merged = { ...base, type: 'category', data: xData }
    out['xAxis'] = Array.isArray(x) ? [merged, ...x.slice(1)] : merged
  }
  return { option: out, warnings }
}

function place(v: unknown, size: Double, extent: Double): Double | null {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    if (v === 'center' || v === 'middle') return (size - extent) / 2.0
    if (v.endsWith('%')) {
      const n = Number(v.slice(0, -1))
      return Number.isFinite(n) ? (size * n) / 100.0 : null
    }
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** Free-form shapes from `option.graphic` as draw commands, in document order. */
export function graphicCommands(option: EChartsOptionLike, width: Double, height: Double): { cmds: DrawCmd[]; warnings: OptionWarning[] } {
  const cmds: DrawCmd[] = []
  const warnings: OptionWarning[] = []
  const raw = option['graphic']
  const elements = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw['elements']) ? (raw['elements'] as unknown[]) : isObj(raw) ? [raw] : []
  const walk = (els: unknown[], ox: Double, oy: Double, path: string): void => {
    for (let i = 0; i < els.length; i++) {
      const e = els[i]
      const p = path + '[' + String(i) + ']'
      if (!isObj(e)) continue
      const style = isObj(e['style']) ? e['style'] : {}
      const shape = isObj(e['shape']) ? e['shape'] : {}
      const type = e['type']
      const fill = typeof style['fill'] === 'string' ? (style['fill'] as string) : '#334155'
      const stroke = typeof style['stroke'] === 'string' ? (style['stroke'] as string) : fill
      const lineWidth = num(style['lineWidth']) ?? 1.0
      // Position: explicit x/y, else left/top (right/bottom anchored from the far edge).
      const w = num(shape['width']) ?? (type === 'circle' ? (num(shape['r']) ?? 0.0) * 2.0 : 0.0)
      const hgt = num(shape['height']) ?? (type === 'circle' ? (num(shape['r']) ?? 0.0) * 2.0 : 0.0)
      let x = num(e['x']) ?? 0.0
      let y = num(e['y']) ?? 0.0
      const left = place(e['left'], width, w)
      const top = place(e['top'], height, hgt)
      const right = place(e['right'], width, 0.0)
      const bottom = place(e['bottom'], height, 0.0)
      if (left !== null) x = left
      else if (right !== null) x = width - right - w
      if (top !== null) y = top
      else if (bottom !== null) y = height - bottom - hgt
      x = x + ox
      y = y + oy
      if (type === 'group') {
        walk(Array.isArray(e['children']) ? (e['children'] as unknown[]) : [], x, y, p + '.children')
        continue
      }
      if (type === 'text') {
        const text = typeof style['text'] === 'string' ? (style['text'] as string) : String(style['text'] ?? '')
        const size = num(style['fontSize']) ?? 12.0
        const align = style['textAlign'] === 'center' ? 'middle' : style['textAlign'] === 'right' ? 'end' : 'start'
        cmds.push({ kind: 'text', text, at: { x, y }, fill, size, align, baseline: 'top' })
      } else if (type === 'rect') {
        cmds.push({ kind: 'rect', rect: { x: x + (num(shape['x']) ?? 0.0), y: y + (num(shape['y']) ?? 0.0), w, h: hgt }, fill })
      } else if (type === 'circle') {
        cmds.push({ kind: 'circle', center: { x: x + (num(shape['cx']) ?? 0.0), y: y + (num(shape['cy']) ?? 0.0) }, radius: num(shape['r']) ?? 0.0, fill })
      } else if (type === 'line') {
        cmds.push({ kind: 'line', from: { x: x + (num(shape['x1']) ?? 0.0), y: y + (num(shape['y1']) ?? 0.0) }, to: { x: x + (num(shape['x2']) ?? 0.0), y: y + (num(shape['y2']) ?? 0.0) }, stroke, width: lineWidth })
      } else if (type === 'polygon' || type === 'polyline') {
        const pts: Pt[] = []
        for (const q of Array.isArray(shape['points']) ? (shape['points'] as unknown[]) : []) {
          if (Array.isArray(q) && num(q[0]) !== null && num(q[1]) !== null) pts.push({ x: x + (num(q[0]) as number), y: y + (num(q[1]) as number) })
        }
        if (pts.length >= 2) cmds.push(type === 'polygon' ? { kind: 'polygon', points: pts, fill } : { kind: 'polyline', points: pts, stroke, width: lineWidth })
      } else {
        warnings.push({ code: 'mark-shape-unsupported', path: p + '.type', message: 'graphic type "' + String(type) + '" is not supported yet (text, rect, circle, line, polygon, polyline, group are); it was ignored.' })
      }
    }
  }
  walk(elements, 0.0, 0.0, 'graphic')
  return { cmds, warnings }
}

/** Splice a graphic layer into an already-rendered `<svg>` string, above the chart. */
export function appendGraphicLayer(svg: string, cmds: DrawCmd[], width: Double, height: Double): string {
  if (cmds.length === 0) return svg
  const layer = renderSvg(cmds, width, height, {})
  const open = layer.indexOf('>')
  const close = layer.lastIndexOf('</svg>')
  if (open < 0 || close < 0) return svg
  const inner = layer.slice(open + 1, close)
  const at = svg.lastIndexOf('</svg>')
  return at < 0 ? svg : svg.slice(0, at) + inner + svg.slice(at)
}

/** Width/height as declared on an `<svg>` root, for splicing a layer at the right scale. */
export function svgSize(svg: string): { width: Double; height: Double } | null {
  const w = /width="([0-9.]+)"/.exec(svg)
  const h = /height="([0-9.]+)"/.exec(svg)
  if (w === null || h === null) return null
  return { width: Number(w[1]), height: Number(h[1]) }
}
