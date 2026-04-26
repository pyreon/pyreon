/**
 * Benchmark harness.
 *
 * Each test runs WARMUP + RUNS times; warmup samples are discarded.
 * We report median + p90 (not mean + stddev) — outlier-robust under
 * multi-process load and matches what krausest/js-framework-benchmark
 * publishes.
 *
 * A forced layout (`getBoundingClientRect`) before timing ends ensures
 * the browser has flushed style/layout — same method used by
 * js-framework-benchmark.
 *
 * Test data is generated from a seeded mulberry32 RNG so two runs
 * across different commits compare like-for-like data shapes. Reset
 * the RNG at the start of each framework via `resetRng()`.
 */

export interface BenchResult {
  name: string
  /** Median in ms across `runs` timed samples (warmup excluded). */
  median: number
  /** 90th percentile in ms — surfaces tail latency. */
  p90: number
  min: number
  max: number
  runs: number
}

export interface BenchSuite {
  framework: string
  container: HTMLElement
  results: BenchResult[]
}

export const WARMUP = 5
export const RUNS = 20

export interface BenchOptions {
  /** Reset hook fired before each (warmup + timed) iteration. */
  reset?: () => void | Promise<void>
  /**
   * Verify the DOM after EACH iteration. Called with the container.
   * Throw to fail the iteration. Use `expectRows(container, N)` for the
   * common case. Without verification, frameworks that fail to commit
   * a render before the bench timer ends produce deceptively-fast
   * numbers — the whole point of the fair-bench methodology.
   */
  verify?: (container: HTMLElement) => void
}

export async function bench(
  name: string,
  suite: BenchSuite,
  fn: () => void | Promise<void>,
  options: BenchOptions = {},
): Promise<BenchResult> {
  const samples: number[] = []

  for (let i = 0; i < WARMUP + RUNS; i++) {
    if (options.reset) await options.reset()
    const t0 = performance.now()
    await fn()
    // Force layout flush so DOM work is included in the measurement
    suite.container.getBoundingClientRect()
    const elapsed = performance.now() - t0
    if (i >= WARMUP) samples.push(elapsed)
    if (options.verify) options.verify(suite.container)
    // Yield to browser between runs
    await tick()
  }

  const sorted = [...samples].sort((a, b) => a - b)
  const median = quantile(sorted, 0.5)
  const p90 = quantile(sorted, 0.9)
  const min = sorted[0] ?? 0
  const max = sorted[sorted.length - 1] ?? 0

  const result: BenchResult = { name, median, p90, min, max, runs: RUNS }
  suite.results.push(result)
  return result
}

/** Linear-interpolated quantile on a pre-sorted array. */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0] ?? 0
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo] ?? 0
  const frac = pos - lo
  return (sorted[lo] ?? 0) * (1 - frac) + (sorted[hi] ?? 0) * frac
}

export function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0))
}

/** Build a row data array of N items */
export interface Row {
  id: number
  label: string
}

let _nextId = 1

// ─── Seeded RNG (mulberry32) ─────────────────────────────────────────────────
//
// Deterministic PRNG so runs across commits compare on identical data.
// Reset before each framework via `resetRng()` so Pyreon and React see
// the same row labels in the same order.
const RNG_SEED = 0x9e3779b9
let _rngState = RNG_SEED

function rng(): number {
  _rngState = (_rngState + 0x6d2b79f5) | 0
  let t = _rngState
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function resetRng(): void {
  _rngState = RNG_SEED
  _nextId = 1
}

const ADJECTIVES = [
  'pretty',
  'large',
  'big',
  'small',
  'tall',
  'short',
  'long',
  'handsome',
  'plain',
  'quaint',
  'clean',
  'elegant',
  'easy',
  'angry',
  'crazy',
  'helpful',
  'mushy',
  'odd',
  'unsightly',
  'adorable',
  'important',
  'inexpensive',
  'cheap',
  'expensive',
  'fancy',
]
const COLOURS = [
  'red',
  'yellow',
  'blue',
  'green',
  'pink',
  'brown',
  'purple',
  'brown',
  'white',
  'black',
  'orange',
]
const NOUNS = [
  'table',
  'chair',
  'house',
  'bbq',
  'desk',
  'car',
  'pony',
  'cookie',
  'sandwich',
  'burger',
  'pizza',
  'mouse',
  'keyboard',
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)] as T
}

export function buildRows(count: number): Row[] {
  return Array.from({ length: count }, () => ({
    id: _nextId++,
    label: `${pick(ADJECTIVES)} ${pick(COLOURS)} ${pick(NOUNS)}`,
  }))
}

/**
 * Build `count` items using the shared ID counter, calling `factory(id, label)`
 * for each row. Avoids allocating an intermediate Row[] when the caller needs
 * a different shape (e.g. reactive rows with signals).
 */
export function buildRowsWith<T>(count: number, factory: (id: number, label: string) => T): T[] {
  const rows = new Array<T>(count)
  for (let i = 0; i < count; i++) {
    rows[i] = factory(_nextId++, `${pick(ADJECTIVES)} ${pick(COLOURS)} ${pick(NOUNS)}`) as T
  }
  return rows
}

/**
 * Verify the rendered DOM matches the expected row count. Throws with
 * a descriptive error if not — makes any framework that fails to commit
 * a render before the bench timer ends visible as a failed run rather
 * than a deceptively-fast number.
 *
 * Wrap into a `verify` callback for `bench()` via `expectRows(N)`.
 */
export function assertRowCount(container: HTMLElement, expected: number, label = 'rows'): void {
  const got = container.querySelectorAll('tr').length
  if (got !== expected) {
    throw new Error(
      `[bench] ${label}: expected ${expected} <tr>, got ${got}. ` +
        `Framework failed to commit DOM before timer ended.`,
    )
  }
}

/** Sugar for the most common verify case — N rows rendered. */
export function expectRows(expected: number) {
  return (container: HTMLElement) => assertRowCount(container, expected)
}

/**
 * Verify N rows AND M selected (for the select-row test). Throws if
 * either count is wrong.
 */
export function expectRowsWithSelected(rows: number, selected: number) {
  return (container: HTMLElement) => {
    assertRowCount(container, rows)
    const got = container.querySelectorAll('tr.selected').length
    if (got !== selected) {
      throw new Error(`[bench] expected ${selected} selected tr, got ${got}`)
    }
  }
}
