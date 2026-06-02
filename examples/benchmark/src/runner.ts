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
  /**
   * 95% bootstrap confidence interval on the median, in ms.
   * `[lower, upper]`. Narrower interval = more stable measurement.
   * Reported next to the median so a reader can tell a 5% delta apart
   * from noise. Computed via 1000-resample percentile bootstrap.
   */
  ci95: [number, number]
  /**
   * Coefficient of variation (stddev / mean) on the timed samples,
   * unitless. Lower = more stable. Common rule of thumb: <0.1 is
   * tight, 0.1-0.3 is fine, >0.3 means the framework is jittery on
   * this test and the median should be read with caution.
   */
  cv: number
  /** Warmup iterations actually performed (≥ WARMUP_MIN, ≤ WARMUP_MAX). */
  warmupUsed: number
}

export interface BenchSuite {
  framework: string
  container: HTMLElement
  results: BenchResult[]
}

/**
 * Warmup is now adaptive — we keep warming until the JS engine reaches
 * steady state (rolling p90 over the last `STABILIZE_WINDOW` samples is
 * within `STABILIZE_TOLERANCE` of the prior window). Bounded by
 * `WARMUP_MIN`/`WARMUP_MAX` so a never-stabilizing framework can't
 * deadlock the harness.
 *
 * Pre-fix `WARMUP = 5` was arbitrary — some frameworks reach steady
 * state in 2-3 runs, others (React's MessageChannel scheduler) need
 * 8-10. A fixed warmup either over-warms (wastes time on stable
 * frameworks) or under-warms (penalises frameworks with longer
 * stabilisation). Adaptive warmup is strictly more objective.
 */
export const WARMUP_MIN = 5
export const WARMUP_MAX = 15
export const STABILIZE_WINDOW = 3
export const STABILIZE_TOLERANCE = 0.10 // 10% — rolling-window p90 deltas
export const RUNS = 20
export const BOOTSTRAP_RESAMPLES = 1000

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
  /**
   * Per-framework commit-boundary hook. Called INSIDE the timed region,
   * AFTER the user's `fn()` returns but BEFORE `getBoundingClientRect()`
   * forces the layout flush. Use this to wait for the framework's
   * scheduler to commit pending DOM updates.
   *
   * Frameworks that need this:
   * - **React, Preact**: `rAF + setTimeout(0)` for MessageChannel scheduler
   * - **Vue**: `Promise.resolve()` (microtask) for its update queue
   * - **Svelte 5**: `flushSync()` from the runtime
   *
   * Frameworks that DON'T need this (omit the option):
   * - **Vanilla**: truly synchronous DOM writes
   * - **Pyreon (raw + compiled)**: signal write → effects → DOM synchronously
   * - **Solid**: same as Pyreon
   *
   * Pre-fix: every impl awaited `tick()` (setTimeout(0)) inside its bench
   * callback. That works for VDOM frameworks (their scheduler needs the
   * macrotask) but adds ~4ms of macrotask-floor delay to synchronous
   * signal frameworks that don't need any wait. The fix: opt-in per
   * framework. Synchronous frameworks now measure their TRUE commit cost;
   * VDOM frameworks measure scheduler-wait-included cost (as they always
   * needed to). Both are honest. The audit + measurement that drove this
   * is documented in CLAUDE.md → "Benchmark Results" → "Methodology".
   */
  commit?: () => void | Promise<void>
}

/**
 * Force a GC pause between iterations when Chromium was launched with
 * `--js-flags=--expose-gc`. Removes the dominant source of inter-run
 * variance: heap growth from the previous iteration's allocations
 * running an unsynchronised collection cycle DURING the next timed
 * region. Bench-fair launches Chromium with the flag; in-page button
 * runs without it (the optional chain short-circuits).
 */
function forceGc(): void {
  const g = globalThis as { gc?: () => void }
  g.gc?.()
}

export async function bench(
  name: string,
  suite: BenchSuite,
  fn: () => void | Promise<void>,
  options: BenchOptions = {},
): Promise<BenchResult> {
  // Adaptive warmup. Track p90 of a rolling STABILIZE_WINDOW.
  // Stop early when two consecutive windows agree within tolerance.
  const warmupSamples: number[] = []
  let warmupUsed = 0
  while (warmupUsed < WARMUP_MAX) {
    if (options.reset) await options.reset()
    const t0 = performance.now()
    await fn()
    // Per-framework commit boundary — inside the timed region, BEFORE
    // the layout flush. Async frameworks (React/Preact/Vue/Svelte) use
    // this to wait for their scheduler; synchronous frameworks (Vanilla,
    // Pyreon, Solid) omit `commit` entirely so they don't pay the
    // macrotask floor.
    if (options.commit) await options.commit()
    suite.container.getBoundingClientRect()
    const elapsed = performance.now() - t0
    warmupSamples.push(elapsed)
    warmupUsed++
    if (options.verify) options.verify(suite.container)
    forceGc()
    await tick()
    // Check stabilisation only after we have enough samples.
    if (warmupUsed >= WARMUP_MIN && warmupUsed >= STABILIZE_WINDOW * 2) {
      const recent = warmupSamples.slice(-STABILIZE_WINDOW)
      const prior = warmupSamples.slice(-(STABILIZE_WINDOW * 2), -STABILIZE_WINDOW)
      const recentP90 = quantile([...recent].sort((a, b) => a - b), 0.9)
      const priorP90 = quantile([...prior].sort((a, b) => a - b), 0.9)
      const delta = Math.abs(recentP90 - priorP90) / Math.max(priorP90, 1e-9)
      if (delta < STABILIZE_TOLERANCE) break
    }
  }

  // Timed run.
  const samples: number[] = []
  for (let i = 0; i < RUNS; i++) {
    if (options.reset) await options.reset()
    forceGc()
    const t0 = performance.now()
    await fn()
    // Per-framework commit boundary (see warmup loop above for rationale).
    if (options.commit) await options.commit()
    // Force layout flush so DOM work is included in the measurement
    suite.container.getBoundingClientRect()
    const elapsed = performance.now() - t0
    samples.push(elapsed)
    if (options.verify) options.verify(suite.container)
    // Yield to browser between runs (not measured — runs outside the t0/elapsed region)
    await tick()
  }

  const sorted = [...samples].sort((a, b) => a - b)
  const median = quantile(sorted, 0.5)
  const p90 = quantile(sorted, 0.9)
  const min = sorted[0] ?? 0
  const max = sorted[sorted.length - 1] ?? 0
  const mean = samples.reduce((s, x) => s + x, 0) / samples.length
  const stddev = Math.sqrt(
    samples.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(samples.length - 1, 1),
  )
  const cv = mean > 0 ? stddev / mean : 0
  const ci95 = bootstrapCI95(samples)

  const result: BenchResult = {
    name,
    median,
    p90,
    min,
    max,
    runs: RUNS,
    ci95,
    cv,
    warmupUsed,
  }
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

/**
 * 95% bootstrap CI on the median. Resamples `samples` with
 * replacement `BOOTSTRAP_RESAMPLES` times, computes the median of
 * each resample, takes the 2.5th and 97.5th percentiles of those
 * resampled medians. Outputs `[lower, upper]` in ms.
 *
 * This is the standard non-parametric way to put error bars on a
 * median that doesn't assume a normal distribution. Sample timing
 * data is heavily skewed (GC pauses cause right-tail outliers) so
 * normal-distribution CIs are wrong; bootstrap is appropriate.
 */
function bootstrapCI95(samples: number[]): [number, number] {
  if (samples.length === 0) return [0, 0]
  if (samples.length === 1) return [samples[0] ?? 0, samples[0] ?? 0]
  const n = samples.length
  const medians: number[] = []
  for (let b = 0; b < BOOTSTRAP_RESAMPLES; b++) {
    const resample: number[] = []
    for (let i = 0; i < n; i++) {
      resample.push(samples[Math.floor(Math.random() * n)] ?? 0)
    }
    resample.sort((a, b2) => a - b2)
    medians.push(quantile(resample, 0.5))
  }
  medians.sort((a, b2) => a - b2)
  return [quantile(medians, 0.025), quantile(medians, 0.975)]
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
