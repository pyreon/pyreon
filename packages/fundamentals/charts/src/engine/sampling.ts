// Large data — ECharts' `sampling` / `large` / `progressive` keys resolved to
// this engine's ONE large-data mechanism: decimation to a bounded point count
// with every series and the category axis thinned on the SAME rows.
//
// Shared by the web facade (`option.ts`, against the measured plot width) and
// the native compiler (`@pyreon/charts/option-layer`, against the option's
// static width at COMPILE time), so a series thins to the same datums on
// every target for a given width.

import { lttbIndices } from './decimate-values'
import type { Double } from './types'

export type SamplingMethod = 'lttb' | 'average' | 'max' | 'min' | 'sum'
const SAMPLING_METHODS = new Set<string>(['lttb', 'average', 'max', 'min', 'sum'])

/** What one series asks of the large-data pass. */
export interface SamplingRequest {
  limit: number
  method: SamplingMethod
}

/** ECharts' default `largeThreshold`. */
export const LARGE_THRESHOLD = 2000
/** ECharts' default `progressiveThreshold`. */
export const PROGRESSIVE_THRESHOLD = 3000

/**
 * What a series' `sampling` / `large` / `progressive` keys ask, or null when
 * nothing applies. `sampling` thins to the pixel `width`; `large` and
 * `progressive` to their thresholds. An unknown `sampling` is reported
 * through `unsupported` (the message names the accepted methods) and the
 * series is left unthinned.
 */
export function samplingRequest(
  s: Record<string, unknown>,
  width: number,
  unsupported: (message: string) => void,
): SamplingRequest | null {
  const toNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const sampling = s['sampling']
  if (sampling !== undefined) {
    if (typeof sampling === 'string' && SAMPLING_METHODS.has(sampling)) return { limit: Math.max(3, Math.floor(width)), method: sampling as SamplingMethod }
    unsupported(`sampling "${String(sampling)}" is not supported (lttb, average, max, min, sum are); the series was not thinned.`)
  }
  if (s['large'] === true) return { limit: Math.max(3, toNum(s['largeThreshold']) ?? LARGE_THRESHOLD), method: 'lttb' }
  const progressive = toNum(s['progressive'])
  if (progressive !== null && progressive > 0) return { limit: Math.max(3, toNum(s['progressiveThreshold']) ?? PROGRESSIVE_THRESHOLD), method: 'lttb' }
  return null
}

/** The rows decimation keeps, per column. */
export interface SharedRows {
  /** One value column per series, every column thinned on the same rows. */
  columns: Double[][]
  categories: string[]
  xValues: Double[] | undefined
}

/**
 * Thin every aligned column on the same rows. The tightest request wins the
 * limit; the FIRST request's method decides how (LTTB keeps real datums, the
 * bucket methods aggregate). Columns of different lengths are never thinned —
 * it would misalign the shared x — and nothing happens under the limit.
 */
export function decimateShared(requests: readonly SamplingRequest[], rows: SharedRows): SharedRows {
  if (requests.length === 0 || rows.columns.length === 0) return rows
  const n = rows.columns[0]!.length
  if (!rows.columns.every((column) => column.length === n)) return rows
  let limit = Infinity
  for (const r of requests) if (r.limit < limit) limit = r.limit
  if (!(n > limit && limit >= 3)) return rows
  const method = requests[0]!.method
  if (method === 'lttb') {
    const keep = lttbIndices(rows.xValues ?? [], rows.columns[0]!, limit)
    if (keep.length === 0) return rows
    return {
      columns: rows.columns.map((column) => keep.map((i) => column[i]!)),
      categories: rows.categories.length === n ? keep.map((i) => rows.categories[i]!) : rows.categories,
      xValues: rows.xValues === undefined ? undefined : keep.map((i) => rows.xValues![i]!),
    }
  }
  const edges: number[] = []
  for (let b = 0; b <= limit; b++) edges.push(Math.floor((b * n) / limit))
  const aggregate = (values: Double[]): Double[] => {
    const out: Double[] = []
    for (let b = 0; b < limit; b++) {
      let acc = NaN
      let count = 0
      for (let i = edges[b]!; i < edges[b + 1]!; i++) {
        const v = values[i]!
        if (Number.isNaN(v)) continue
        acc = count === 0 ? v : method === 'max' ? Math.max(acc, v) : method === 'min' ? Math.min(acc, v) : acc + v
        count++
      }
      out.push(method === 'average' && count > 0 ? acc / count : acc)
    }
    return out
  }
  const firstOf = <T>(list: T[]): T[] => edges.slice(0, limit).map((start) => list[start]!)
  return {
    columns: rows.columns.map(aggregate),
    categories: rows.categories.length === n ? firstOf(rows.categories) : rows.categories,
    xValues: rows.xValues === undefined ? undefined : firstOf(rows.xValues),
  }
}
