import type { Benchmarks } from '../../site/content/model'

const TIMED = new Set(['ns', 'µs', 'ms'])

/**
 * The benchmark callout's big numeral: wins out of the TIMED head-to-head rows
 * (both numbers published, a time unit), e.g. Forms → "4/4". Rows without a
 * timed pair (ratios only, re-render counts, heap) are left out of the count,
 * never rounded into it. With no timed row it counts every row that carries a
 * verdict other than "measured". Ties and losses keep the count honest: 3 wins
 * out of 4 prints "3/4". Pure; exported for tests.
 */
export function benchHeadline(b: Benchmarks): string | undefined {
  const timed = b.rows.filter((r) => TIMED.has(r.unit) && r.pyreon != null && r.rival != null)
  const pool = timed.length > 0 ? timed : b.rows.filter((r) => r.verdict !== 'info')
  if (pool.length === 0) return undefined
  return `${pool.filter((r) => r.verdict === 'win').length}/${pool.length}`
}
