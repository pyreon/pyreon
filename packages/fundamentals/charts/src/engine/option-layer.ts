// Option-level layers shared by both facade halves: the `dataset` pre-pass
// (materialises series data from a shared source) and the `graphic` layer
// (free-form shapes appended after the chart).

import { renderSvg } from './svg'
import type { OptionWarning } from './option'
import { graphicDrawCommands } from './graphic'
import type { GraphicElement } from './graphic'
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

// ---- external transforms -------------------------------------------------
// ECharts ships exactly two built-in dataset transforms (`filter`, `sort`);
// everything else — the ecStat regression / clustering / histogram family, a
// user's own — arrives through `registerTransform`. The registry here speaks
// that contract's `upstream` surface (`cloneRawData`, `getDimensionInfo`,
// `cloneAllDimensionInfo`, `sourceFormat`), so an ecStat transform object can
// be registered as-is.

/** The upstream table a registered transform reads — ECharts' external-transform `upstream` surface. */
export interface ChartTransformUpstream {
  /** Always `'arrayRows'`: rows are arrays in dimension order (object sources were normalised on read). */
  sourceFormat: 'arrayRows'
  /** A deep-enough copy of the rows — mutate freely. */
  cloneRawData(): unknown[][]
  /** The rows themselves — do not mutate. */
  getRawData(): unknown[][]
  /** Resolve a dimension by index or name; `undefined` when unknown. */
  getDimensionInfo(dim: string | number): ChartTransformDimension | undefined
  /** Every dimension, in order. */
  cloneAllDimensionInfo(): ChartTransformDimension[]
}

export interface ChartTransformDimension {
  index: number
  name: string
  displayName: string
}

export interface ChartTransformParams {
  upstream: ChartTransformUpstream
  /** The `config` object written on the dataset's transform entry. */
  config: unknown
}

/** What a transform returns: rows (array or object records) plus optional dimension names. One result, or several for `fromTransformResult`. */
export interface ChartTransformResult {
  data?: unknown[][] | Record<string, unknown>[]
  dimensions?: unknown[]
}

export interface ChartTransform {
  /** The `type` a dataset names, e.g. `'ecStat:regression'` or `'myTransform:double'`. */
  type: string
  transform(params: ChartTransformParams): ChartTransformResult | ChartTransformResult[]
}

const chartTransforms = new Map<string, ChartTransform>()

/**
 * Register an external dataset transform (`echarts.registerTransform`'s shape).
 * Later registrations of the same `type` replace earlier ones. ecStat's
 * transform objects satisfy the contract unchanged:
 *
 * @example
 * import { transform as ecStat } from 'echarts-stat'
 * registerChartTransform(ecStat.regression)
 * // dataset: [{ source }, { transform: { type: 'ecStat:regression', config: { method: 'linear' } } }]
 */
export function registerChartTransform(transform: ChartTransform): void {
  chartTransforms.set(transform.type, transform)
}

/** Remove a registered transform; a dataset naming it warns again. */
export function unregisterChartTransform(type: string): void {
  chartTransforms.delete(type)
}

/** The registered transform types, in registration order. */
export function listChartTransforms(): string[] {
  return Array.from(chartTransforms.keys())
}

function upstreamOf(t: Table): ChartTransformUpstream {
  const dimension = (i: number): ChartTransformDimension => ({ index: i, name: t.dims[i]!, displayName: t.dims[i]! })
  return {
    sourceFormat: 'arrayRows',
    cloneRawData: () => t.rows.map((r) => r.slice()),
    getRawData: () => t.rows,
    getDimensionInfo: (dim) => {
      const i = dimIndex(t, dim)
      return i === null ? undefined : dimension(i)
    },
    cloneAllDimensionInfo: () => t.dims.map((_, i) => dimension(i)),
  }
}

/** Turn a transform's result into a table; dimension names fall back to the upstream's, then to `dimN`. */
function tableFromResult(result: ChartTransformResult, upstream: Table): Table {
  const data = Array.isArray(result.data) ? result.data : []
  const rows: unknown[][] = []
  let objectKeys: string[] | null = null
  for (const record of data) {
    if (Array.isArray(record)) rows.push(record)
    else if (isObj(record)) {
      objectKeys ??= []
      for (const k of Object.keys(record)) if (!objectKeys.includes(k)) objectKeys.push(k)
      rows.push(record as unknown as unknown[])
    }
  }
  if (objectKeys !== null) {
    const keys = objectKeys
    return { dims: keys, rows: rows.map((r) => (Array.isArray(r) ? r : keys.map((k) => (r as unknown as Record<string, unknown>)[k]))) }
  }
  const declared = Array.isArray(result.dimensions)
    ? result.dimensions.map((d, i) => (isObj(d) && typeof d['name'] === 'string' ? (d['name'] as string) : typeof d === 'string' ? d : 'dim' + String(i)))
    : null
  let width = 0
  for (const r of rows) if (r.length > width) width = r.length
  const dims = declared ?? (width === upstream.dims.length ? upstream.dims.slice() : Array.from({ length: width }, (_, i) => 'dim' + String(i)))
  return { dims, rows }
}

/**
 * Apply a dataset's `transform` list and return EVERY result of its last step
 * (a registered transform may produce several — `fromTransformResult` picks
 * one). Built-ins: `filter` and `sort`; anything else resolves through
 * {@link registerChartTransform}, and an unknown type passes the table
 * through with a warning.
 */
export function applyTransformsAll(t: Table, transforms: unknown[], warnings: OptionWarning[], path = 'dataset'): Table[] {
  let results: Table[] = [t]
  for (let i = 0; i < transforms.length; i++) {
    const tr = transforms[i]
    const tp = path + '.transform[' + String(i) + ']'
    if (!isObj(tr)) continue
    const cur = results[0]!
    const cfg = tr['config']
    const type = tr['type']
    if (type === 'filter' || type === 'sort') {
      results = [applyBuiltIn(cur, type, cfg, warnings, tp)]
      continue
    }
    const registered = typeof type === 'string' ? chartTransforms.get(type) : undefined
    if (registered === undefined) {
      // ledger: data.transforms
      warnings.push({ code: 'option-key-unsupported', path: tp + '.type', message: 'dataset transform "' + String(type) + '" is not registered (filter and sort are built in; register others with registerChartTransform); the table passed through unchanged.' })
      results = [cur]
      continue
    }
    let produced: ChartTransformResult | ChartTransformResult[]
    try {
      produced = registered.transform({ upstream: upstreamOf(cur), config: cfg })
    } catch (error) {
      warnings.push({ code: 'series-data-shape', path: tp, message: 'dataset transform "' + String(type) + '" threw (' + (error instanceof Error ? error.message : String(error)) + '); the table passed through unchanged.' })
      results = [cur]
      continue
    }
    const list = Array.isArray(produced) ? produced : [produced]
    results = list.length === 0 ? [{ dims: cur.dims, rows: [] }] : list.map((r) => tableFromResult(isObj(r) ? (r as ChartTransformResult) : {}, cur))
  }
  return results
}

/** Apply a dataset's `transform` list; the FIRST result of the last step (see {@link applyTransformsAll}). */
export function applyTransforms(t: Table, transforms: unknown[], warnings: OptionWarning[], path = 'dataset'): Table {
  return applyTransformsAll(t, transforms, warnings, path)[0]!
}

function applyBuiltIn(cur: Table, type: 'filter' | 'sort', cfg: unknown, warnings: OptionWarning[], tp: string): Table {
  {
    if (type === 'filter') {
      const cond = isObj(cfg) ? (cfg as Cond) : {}
      return { dims: cur.dims, rows: cur.rows.filter((r) => evalCond(cur, cond, r, warnings, tp + '.config')) }
    } else {
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
      return { dims: cur.dims, rows: indexed.map((x) => x.r) }
    }
  }
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
  // `id` references resolve to positions: `fromDatasetId` / `datasetId` are
  // ECharts' spelling for a dataset named rather than counted.
  const idIndex = new Map<string, number>()
  for (let i = 0; i < datasets.length; i++) {
    const id = datasets[i]!['id']
    if (typeof id === 'string' && !idIndex.has(id)) idIndex.set(id, i)
  }
  const datasetRef = (byId: unknown, byIndex: unknown, fallback: number): number =>
    typeof byId === 'string' ? (idIndex.get(byId) ?? -1) : (num(byIndex) ?? fallback)
  // Datasets resolve in order so a derived one can build on an earlier one.
  // Each keeps EVERY result of its transform so `fromTransformResult` can pick.
  const tables: (Table | null)[] = []
  const results: Table[][] = []
  for (let i = 0; i < datasets.length; i++) {
    const d = datasets[i]!
    const trRaw = d['transform']
    const hasUpstream = d['fromDatasetIndex'] !== undefined || d['fromDatasetId'] !== undefined || d['fromTransformResult'] !== undefined
    if (trRaw === undefined && !hasUpstream) {
      const own = readSource(d)
      tables.push(own)
      results.push(own === null ? [] : [own])
      continue
    }
    const from = datasetRef(d['fromDatasetId'], d['fromDatasetIndex'], 0)
    const which = num(d['fromTransformResult']) ?? 0
    const upstreamResults = results[from] ?? []
    const base = upstreamResults[which] ?? null
    if (base === null) {
      const refPath = d['fromTransformResult'] !== undefined && upstreamResults.length > 0 ? 'fromTransformResult' : d['fromDatasetId'] !== undefined ? 'fromDatasetId' : 'fromDatasetIndex'
      const detail = refPath === 'fromTransformResult'
        ? 'The upstream dataset produced ' + String(upstreamResults.length) + ' result(s); result ' + String(which) + ' does not exist.'
        : 'The dataset to transform (' + (typeof d['fromDatasetId'] === 'string' ? 'id "' + d['fromDatasetId'] + '"' : 'index ' + String(from)) + ') has no readable source.'
      warnings.push({ code: 'series-data-shape', path: 'dataset[' + String(i) + '].' + refPath, message: detail + ' This dataset is empty.' })
      tables.push(null)
      results.push([])
      continue
    }
    const produced = trRaw === undefined ? [base] : applyTransformsAll(base, Array.isArray(trRaw) ? trRaw : [trRaw], warnings, 'dataset[' + String(i) + ']')
    tables.push(produced[0] ?? null)
    results.push(produced)
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
    delete o['datasetId']
    delete o['encode']
    delete o['seriesLayoutBy']
    return o
  }
  const outSeries = seriesArr.map((sRaw, si) => {
    if (!isObj(sRaw) || Array.isArray(sRaw['data'])) return sRaw
    const dsIndex = datasetRef(sRaw['datasetId'], sRaw['datasetIndex'], 0)
    let t = tables[dsIndex] ?? null
    if (t === null) {
      const refKey = typeof sRaw['datasetId'] === 'string' ? 'datasetId' : 'datasetIndex'
      warnings.push({ code: 'series-data-shape', path: 'series[' + String(si) + '].' + refKey, message: 'No readable dataset source for this series; treated as empty.' })
      return sRaw
    }
    if (sRaw['seriesLayoutBy'] === 'row') t = transpose(t)
    const enc = isObj(sRaw['encode']) ? sRaw['encode'] : {}
    const type = typeof sRaw['type'] === 'string' ? (sRaw['type'] as string) : ''
    const col = (v: unknown[] | undefined | unknown, fallback: number): number | null => dimIndex(t!, Array.isArray(v) ? v[0] : v) ?? (fallback < t!.dims.length ? fallback : null)
    // `encode.tooltip` picks the dimensions the tooltip shows under the value:
    // each named column becomes a `tooltipExtras` entry the facade hands to
    // the engine's `Series.extras` (numbers as values, anything else as text).
    // An unknown dimension warns by name and is skipped.
    const tipDims = enc['tooltip'] === undefined ? [] : Array.isArray(enc['tooltip']) ? (enc['tooltip'] as unknown[]) : [enc['tooltip']]
    const tooltipExtras: { label: string; numbers?: number[]; texts?: string[] }[] = []
    for (const ref of tipDims) {
      const c = dimIndex(t, ref)
      if (c === null) {
        warnings.push({ code: 'series-data-shape', path: 'series[' + String(si) + '].encode.tooltip', message: 'Unknown dataset dimension "' + String(ref) + '"; the tooltip skips it.' })
        continue
      }
      const cells = t.rows.map((r) => r[c])
      const label = t.dims[c] ?? String(ref)
      if (cells.every((v) => num(v) !== null)) tooltipExtras.push({ label, numbers: cells.map((v) => num(v) as number) })
      else tooltipExtras.push({ label, texts: cells.map((v) => (v === undefined || v === null ? '' : String(v))) })
    }
    const withExtras = (o: Record<string, unknown>): Record<string, unknown> => (tooltipExtras.length === 0 ? o : { ...o, tooltipExtras })
    // `encode.seriesName` names the series after a dimension; an explicit
    // `name` still wins (it is the author's, not the data's).
    let sr: Record<string, unknown> = sRaw
    if (sr['name'] === undefined && enc['seriesName'] !== undefined) {
      const nameCol = dimIndex(t, Array.isArray(enc['seriesName']) ? (enc['seriesName'] as unknown[])[0] : enc['seriesName'])
      if (nameCol !== null) sr = { ...sr, name: t.dims[nameCol] }
      else warnings.push({ code: 'series-data-shape', path: 'series[' + String(si) + '].encode.seriesName', message: 'Unknown dataset dimension "' + String(enc['seriesName']) + '"; the series keeps its default name.' })
    }
    if (NAME_VALUE_TYPES.has(type)) {
      const nameCol = col(enc['itemName'], 0)
      const valueCol = col(enc['value'], enc['value'] === undefined ? nextColumn(dsIndex) : 0)
      if (nameCol === null || valueCol === null) return sr
      return withExtras(withData(sr, t.rows.map((r) => ({ name: String(r[nameCol] ?? ''), value: num(r[valueCol]) ?? 0 }))))
    }
    if (type === 'scatter') {
      const xCol = col(enc['x'], 0)
      const yCol = col(enc['y'], enc['y'] === undefined ? nextColumn(dsIndex) : 0)
      if (xCol === null || yCol === null) return sr
      return withExtras(withData(sr, t.rows.map((r) => [num(r[xCol]) ?? 0, num(r[yCol]) ?? 0])))
    }
    const xCol = col(enc['x'], 0)
    const want = enc['y'] === undefined ? nextColumn(dsIndex) : 0
    const yCol = col(enc['y'], want)
    if (yCol === null) {
      warnings.push({ code: 'series-data-shape', path: 'series[' + String(si) + ']', message: 'The dataset has no dimension for this series (dimension ' + String(want) + '); treated as empty.' })
      return sr
    }
    if (xData === null && xCol !== null) xData = t.rows.map((r) => r[xCol])
    // `encode.itemName` names each datum (the {name, value} item the facade
    // already reads); without it the values stay bare, byte-identical to before.
    const itemNameCol = enc['itemName'] === undefined ? null : dimIndex(t, Array.isArray(enc['itemName']) ? (enc['itemName'] as unknown[])[0] : enc['itemName'])
    if (enc['itemName'] !== undefined && itemNameCol === null) {
      warnings.push({ code: 'series-data-shape', path: 'series[' + String(si) + '].encode.itemName', message: 'Unknown dataset dimension "' + String(enc['itemName']) + '"; the data keeps bare values.' })
    }
    return withExtras(withData(sr, t.rows.map((r) => (itemNameCol === null ? num(r[yCol]) ?? null : { name: String(r[itemNameCol] ?? ''), value: num(r[yCol]) ?? null }))))
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
  const parsed = graphicElements(option, width, height)
  return { cmds: graphicDrawCommands(parsed.elements), warnings: parsed.warnings }
}

/** Every `graphic` element, positioned against the canvas — the engine draws them. */
export function graphicElements(option: EChartsOptionLike, width: Double, height: Double): { elements: GraphicElement[]; warnings: OptionWarning[] } {
  const elementsOut: GraphicElement[] = []
  const warnings: OptionWarning[] = []
  const raw = option['graphic']
  const roots = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw['elements']) ? (raw['elements'] as unknown[]) : isObj(raw) ? [raw] : []
  const walk = (els: unknown[], ox: Double, oy: Double, path: string): void => {
    for (let i = 0; i < els.length; i++) {
      const e = els[i]
      const p = path + '[' + String(i) + ']'
      if (!isObj(e)) continue
      const style = isObj(e['style']) ? e['style'] : {}
      const shape = isObj(e['shape']) ? e['shape'] : {}
      const type = String(e['type'] ?? '')
      const fill = typeof style['fill'] === 'string' ? (style['fill'] as string) : '#334155'
      const stroke = typeof style['stroke'] === 'string' ? (style['stroke'] as string) : fill
      const lineWidth = num(style['lineWidth']) ?? 1.0
      const radius = num(shape['r']) ?? 0.0
      // Position: explicit x/y, else left/top (right/bottom anchored from the far edge).
      const w = num(shape['width']) ?? (type === 'circle' ? radius * 2.0 : 0.0)
      const hgt = num(shape['height']) ?? (type === 'circle' ? radius * 2.0 : 0.0)
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
      const pts: Pt[] = []
      const pushPair = (a: unknown, b: unknown): void => {
        if (num(a) !== null && num(b) !== null) pts.push({ x: num(a) as number, y: num(b) as number })
      }
      let kind = type
      if (type === 'line') {
        pushPair(shape['x1'], shape['y1'])
        pushPair(shape['x2'], shape['y2'])
      } else if (type === 'polygon' || type === 'polyline') {
        for (const q of Array.isArray(shape['points']) ? (shape['points'] as unknown[]) : []) {
          if (Array.isArray(q)) pushPair(q[0], q[1])
        }
      } else if (type === 'bezierCurve') {
        kind = 'bezier'
        pushPair(shape['x1'], shape['y1'])
        pushPair(shape['cpx1'], shape['cpy1'])
        if (num(shape['cpx2']) !== null && num(shape['cpy2']) !== null) pushPair(shape['cpx2'], shape['cpy2'])
        pushPair(shape['x2'], shape['y2'])
      } else if (type !== 'text' && type !== 'rect' && type !== 'circle' && type !== 'arc' && type !== 'ring' && type !== 'sector') {
        warnings.push({
          // ledger: coordinates.graphic
          code: 'mark-shape-unsupported',
          path: p + '.type',
          message:
            type === 'image'
              ? 'graphic image elements are not supported (they need a loaded bitmap, which the draw list has no form for); the element was skipped.'
              : 'graphic type "' + type + '" is not supported yet (text, rect, circle, line, polygon, polyline, bezierCurve, arc, ring, sector and group are); the element was skipped.',
        })
        continue
      }
      elementsOut.push({
        kind,
        x,
        y,
        w,
        h: hgt,
        fill,
        stroke,
        lineWidth,
        text: type === 'text' ? (typeof style['text'] === 'string' ? (style['text'] as string) : String(style['text'] ?? '')) : '',
        fontSize: num(style['fontSize']) ?? 12.0,
        align: style['textAlign'] === 'center' ? 'middle' : style['textAlign'] === 'right' ? 'end' : 'start',
        // `rect` carries its shape offset in the same two fields the round
        // shapes use for their centre: one struct, no per-kind optionals.
        cx: type === 'rect' ? num(shape['x']) ?? 0.0 : num(shape['cx']) ?? 0.0,
        cy: type === 'rect' ? num(shape['y']) ?? 0.0 : num(shape['cy']) ?? 0.0,
        r: radius,
        r0: num(shape['r0']) ?? 0.0,
        startAngle: num(shape['startAngle']) ?? 0.0,
        endAngle: num(shape['endAngle']) ?? 0.0,
        clockwise: shape['clockwise'] !== false,
        points: pts,
      })
    }
  }
  walk(roots, 0.0, 0.0, 'graphic')
  return { elements: elementsOut, warnings }
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
