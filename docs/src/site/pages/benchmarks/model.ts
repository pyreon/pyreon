import type { ProductData } from '../../content/model'
import type { Verdict } from '../../content/types-site'

/**
 * Pure data shaping for `/benchmarks` (unit-tested in tests/benchmarks-model.test.ts).
 */

/** One bar of the row board: a framework and its run-1 median for the chosen operation. */
export interface RowBar {
  name: string
  ms: number
}

/** The row board for one operation, fastest first. Frameworks and values are index-aligned in the content. */
export function sortedRowBoard(frameworks: readonly string[], values: readonly number[]): RowBar[] {
  return frameworks
    .map((name, i) => ({ name, ms: values[i] ?? Number.NaN }))
    .filter((b) => Number.isFinite(b.ms))
    .sort((a, b) => a.ms - b.ms)
}

/** `0.705` → "705 µs", `7.26` → "7.26 ms", `72.64` → "72.6 ms". */
export function formatMs(ms: number): string {
  if (ms < 1) return `${Number((ms * 1000).toPrecision(3)).toLocaleString('en')} µs`
  if (ms < 10) return `${ms.toFixed(2)} ms`
  return `${ms.toFixed(1)} ms`
}

/**
 * A tick on a millisecond axis: one unit for every tick, so the zero tick
 * reads "0 ms" beside "200 ms" (never "0 µs"), and sub-millisecond ticks keep
 * the unit too ("0.2 ms").
 */
export function formatAxisMs(ms: number): string {
  if (ms === 0) return '0 ms'
  return `${Number(ms.toPrecision(3)).toLocaleString('en')} ms`
}

/** µs per op, as the scaling data stores it. */
export function formatUs(us: number): string {
  if (us >= 1000) return `${(us / 1000).toLocaleString('en', { maximumFractionDigits: 2 })} ms`
  return `${us.toLocaleString('en', { maximumFractionDigits: 3 })} µs`
}

/** Rows for a chart over the scaling data: one row per size, one column per framework. */
export function scalingRows(sizes: readonly string[], series: Readonly<Record<string, readonly number[]>>): Record<string, string | number>[] {
  return sizes.map((size, i) => {
    const row: Record<string, string | number> = { size: `${size} rows` }
    for (const [name, values] of Object.entries(series)) row[name] = values[i] ?? Number.NaN
    return row
  })
}

// ─── Every product ────────────────────────────────────────────────────────

export type ProductFilter = 'all' | 'win' | 'loss' | 'info'

export interface ProductBenchSummary {
  id: string
  name: string
  href: string
  headline: string
  rival: string
  run: string
  counts: Record<Verdict, number>
  /** Has at least one win. */
  wins: boolean
  /** Has at least one loss. */
  losses: boolean
  /** Every row is a throughput figure with no head-to-head verdict. */
  infoOnly: boolean
}

/** The singular and plural word for each verdict (`template.products.tally` in the content). */
export type TallyWords = Readonly<Record<Verdict, readonly [one: string, many: string]>>

/** "6 wins · 1 tie · 1 loss": every verdict with a count, in a fixed order. */
export function tally(counts: Readonly<Record<Verdict, number>>, words: TallyWords): string {
  return (['win', 'tie', 'split', 'loss', 'info'] as const)
    .filter((v) => counts[v] > 0)
    .map((v) => `${counts[v]} ${words[v][counts[v] === 1 ? 0 : 1]}`)
    .join(' · ')
}

/** One product's card, from its content file's `benchmarks` (null when it has none). */
export function summarizeProduct(p: Pick<ProductData, 'id' | 'name' | 'benchmarks'>): ProductBenchSummary | null {
  const b = p.benchmarks
  if (!b || b.rows.length === 0) return null
  const counts: Record<Verdict, number> = { win: 0, tie: 0, split: 0, loss: 0, info: 0 }
  for (const r of b.rows) {
    const v = (r.verdict in counts ? r.verdict : 'info') as Verdict
    counts[v]++
  }
  return {
    id: p.id,
    name: p.name,
    href: `/products/${p.id}#benchmarks`,
    headline: b.h,
    rival: b.rival,
    run: b.run,
    counts,
    wins: counts.win > 0,
    losses: counts.loss > 0,
    infoOnly: counts.info === b.rows.length,
  }
}

export function matchesFilter(s: ProductBenchSummary, f: ProductFilter): boolean {
  switch (f) {
    case 'win':
      return s.wins
    case 'loss':
      return s.losses
    case 'info':
      return s.infoOnly
    default:
      return true
  }
}

/** Products with wins first, then by name. */
export function sortSummaries(list: readonly ProductBenchSummary[]): ProductBenchSummary[] {
  return [...list].sort((a, b) => Number(b.wins) - Number(a.wins) || b.counts.win - a.counts.win || a.name.localeCompare(b.name))
}

/** The PR numbers in a harness-bug entry ("#2878, #2864" → [2878, 2864]). */
export function prNumbers(pr: string): number[] {
  return [...pr.matchAll(/#(\d+)/g)].map((m) => Number(m[1]))
}
