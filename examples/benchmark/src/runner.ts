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
  /**
   * Raw timed samples in ms (length === `runs`). Surfaced so external
   * orchestrators (e.g. `bench-fair.ts --repeat N`) can POOL samples
   * across multiple independent runs to compute a tighter CI95 over
   * 20×N samples instead of N point-medians. Internally unused; safe
   * to drop from JSON output if size matters.
   */
  samples: number[]
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

/**
 * Batch mode (see `BenchOptions.batchK`) runs K cycles per sample, so each
 * sample already costs K× a normal one. Fewer samples keep the wall-clock
 * comparable while the per-sample precision is far higher — a K=200 region is
 * ~2ms-20ms wide, i.e. 20-200 clock quanta even on the CLAMPED 100µs clock.
 */
export const BATCH_WARMUP = 3
export const BATCH_RUNS = 12

/**
 * Cycles per batch region, chosen so the region is ≫ the 100µs clamp even for
 * the fastest framework. `clear` cycles include a ~8ms rebuild, so K=40 is
 * already a ~350ms region; `select` cycles are ~1-100µs, so they need far more.
 */
function kOverride(param: string): number | null {
  if (typeof location === 'undefined') return null
  const v = Number(new URL(location.href).searchParams.get(param))
  return Number.isFinite(v) && v >= 1 ? v : null
}

/**
 * `?batchKClear=N` / `?batchKSelect=N` sweep them INDEPENDENTLY, so a reader can
 * check the instrument against its own soundness condition: **a batch
 * instrument is only valid if the per-cycle cost is independent of K.** If cost
 * falls as K grows, the batching is amortising something the per-op path pays
 * per iteration (GC, allocator state, layout coalescing) — a finding about the
 * harness, not the framework, that must be resolved before reporting.
 *
 * They must be swept separately because the two ops differ by ~4 orders of
 * magnitude in cycle cost. A shared K is wrong at both ends: K=40 leaves a
 * `select` region at ~13 quanta (still quantization-dominated, and biased HIGH
 * — which is exactly why an early shared sweep showed select "falling" with K
 * and looked like an amortisation artifact), while K=2000 would make a `clear`
 * region ~17 SECONDS per sample.
 */
export const BATCH_K_CLEAR = kOverride('batchKClear') ?? 40
export const BATCH_K_SELECT = kOverride('batchKSelect') ?? 2000

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
   * Each impl uses the TIGHTEST commit that still passes DOM verification,
   * so the timed region isolates framework work and minimises scheduler
   * latency (objectivity pass — see CLAUDE.md → "Benchmark Results"):
   * - **React, Svelte 5**: `flushSync()` — commits SYNCHRONOUSLY, zero
   *   scheduler wait, measures pure reconcile+commit CPU.
   * - **Vue**: `await nextTick()` — one microtask (Vue's real flush
   *   boundary), no rAF.
   * - **Preact**: `await Promise.resolve()` — one microtask (Preact's real
   *   batch-flush boundary), no rAF.
   * - **Vanilla / Pyreon (raw + compiled) / Solid**: nothing — signal/DOM
   *   writes are synchronous; the DOM is committed when `fn()` returns.
   *
   * The earlier methodology used `rAF + setTimeout(0)` for React/Preact,
   * which folded a full animation-frame of browser scheduling latency into
   * their timed region and inflated their small-list numbers. `flushSync`
   * (React/Svelte) and a single microtask (Vue/Preact) are the tightest
   * waits that still commit the DOM, so the comparison is closer to pure
   * framework CPU. Trade-off: `flushSync` is not React's default async path,
   * so these numbers are CPU-objective, not real-world-async-latency.
   */
  commit?: () => void | Promise<void>
  /**
   * BATCH MODE — the clock-independent instrument.
   *
   * When set to K > 1, one timed sample covers K consecutive
   * `[reset(); fn(); commit()]` CYCLES inside a SINGLE timed region, and the
   * reported sample is the region total divided by K.
   *
   * Why this exists: Chromium clamps `performance.now()` to 100µs on a
   * non-isolated page, and ops like `clear rows` (~100-200µs) are ONE OR TWO
   * TICKS. Timing them individually measures which side of a tick boundary
   * the op landed on. Timing K=200 of them makes the region tens of
   * milliseconds — 100-1000× the quantum — so the quantization error is
   * diluted by K and the result no longer depends on the clock's resolution
   * at all. This is sound at 100µs AND at 5µs, which is what makes it the
   * independent cross-check on the cross-origin-isolation fix.
   *
   * WHAT IT MEASURES — read carefully, this is the honest caveat:
   * the quantity is the **cycle** (`reset` + `op`), NOT the op alone,
   * because `reset` has to run inside the region to restore the precondition
   * (you cannot clear a list twice without rebuilding it in between).
   *   - `clear rows`  → cycle = build-1000 + clear-1000
   *   - `select row`  → cycle = deselect + select = 2 selection changes
   * For `clear`, isolating the op needs the build subtracted, and that
   * subtrahend CANNOT come from a "build only" batch: to build from empty
   * twice you must clear in between, so a build-only loop degenerates into
   * REPLACE (= teardown + build) and the teardown it contains is exactly the
   * quantity being solved for. The subtraction cancels. The build therefore
   * has to come from the separately-measured `create 1,000 rows` op, and the
   * agreement between (cycle − create) and the directly-timed `clear` is the
   * corroboration between the two instruments.
   *
   * PER-CYCLE STATE VERIFICATION. The normal `verify` walks the tree
   * (`querySelectorAll('tr')`), which on a 1000-row table costs far more than
   * the ~100µs op — running it inside the region would measure the verifier.
   * Instead batch mode accumulates an O(1) CHECKSUM: it reads the row
   * container's `childElementCount` after every `fn()` and sums it. After the
   * region the sum must equal `batchExpect × K`. A cycle whose op silently
   * no-op'd (e.g. a `clear` of an already-empty list, the exact way this op
   * once measured 0µs) lands a different count and fails the whole sample.
   * The read is one cached property access, identical for every framework, so
   * it cannot bias a comparison.
   *
   * `batchProbe` returns that O(1) number and MUST assert the effect the op
   * claims — not a proxy for it. `clear` probes the row count (0); `select`
   * probes whether row 500 actually carries the selected class (1), because a
   * row COUNT is unchanged by a selection and would happily pass while no
   * selection occurred. Defaults to the row count when omitted.
   * `batchExpect` is that probe's expected value after each `fn()`.
   *
   * `batchPreExpect` is the probe value expected after `reset()` but BEFORE
   * `fn()` — the PRECONDITION. It is not optional rigour: checking only the
   * post-op state passes a cycle in which the reset silently did nothing,
   * because "0 rows after clear" is indistinguishable from "0 rows because
   * the rebuild never happened". That exact hole made a build+clear cycle
   * measure 145µs (clear alone) while reporting a clean checksum.
   */
  batchK?: number
  batchProbe?: (container: HTMLElement) => number
  batchExpect?: number
  /** Probe value expected after `reset()`, before `fn()`. See above. */
  batchPreExpect?: number
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

/**
 * Resolve the element whose `childElementCount` tracks the rendered row count.
 * Cached once per batch sample — `querySelector` itself is never in the region.
 */
function rowParent(container: HTMLElement): Element | null {
  return container.querySelector('tbody') ?? container.querySelector('table') ?? container
}

/**
 * Row-parent accessor that survives a framework REPLACING the container node.
 *
 * Caching the `<tbody>` once per sample is wrong for any impl that rebuilds it
 * rather than mutating it — Vanilla's `renderAll` creates a fresh `<tbody>`
 * every call, so the cached handle becomes a DETACHED node reporting 0
 * children. (The precondition gate caught exactly this: `expected 40000, got
 * 0`. Without that gate it would have silently posted a very fast `clear`.)
 *
 * Re-running `querySelector` on every probe would fix it but costs ~0.1-0.5µs
 * per call — material against a ~1µs `select` cycle. `isConnected` is an O(1)
 * property, so this re-resolves ONLY after an actual replacement.
 */
function makeParentGetter(container: HTMLElement): () => Element | null {
  let cached = rowParent(container)
  return () => {
    if (!cached || !cached.isConnected) cached = rowParent(container)
    return cached
  }
}

/**
 * O(1) probe asserting that the row at `index` currently carries the selected
 * class. This is the `select row` batch guard: a row-count probe cannot see a
 * selection at all, so it would pass a batch in which no selection happened —
 * the gate has to assert the effect the op claims, not a proxy for it.
 */
export function selectedProbe(index = 500) {
  let getParent: (() => Element | null) | null = null
  let boundTo: HTMLElement | null = null
  return (container: HTMLElement): number => {
    if (!getParent || boundTo !== container) {
      getParent = makeParentGetter(container)
      boundTo = container
    }
    const el = getParent()?.children[index]
    return el && el.className.includes('selected') ? 1 : 0
  }
}

/**
 * One BATCH sample: K cycles of `[reset; fn; commit]` inside ONE timed region,
 * returning the per-cycle mean. See `BenchOptions.batchK` for why this is the
 * clock-independent instrument and what "cycle" means per op.
 */
async function batchSample(
  suite: BenchSuite,
  fn: () => void | Promise<void>,
  options: BenchOptions,
  K: number,
): Promise<number> {
  const getParent = makeParentGetter(suite.container)
  const probe = options.batchProbe ?? (() => getParent()?.childElementCount ?? -1)
  const expect = options.batchExpect
  let checksum = 0

  // Pre-roll one cycle OUTSIDE the region so the first in-region cycle starts
  // from the same steady state as the rest (the very first reset after a
  // previous op leaves a different precondition).
  if (options.reset) await options.reset()
  await fn()
  if (options.commit) await options.commit()

  const preExpect = options.batchPreExpect
  let preChecksum = 0

  const t0 = performance.now()
  for (let k = 0; k < K; k++) {
    if (options.reset) await options.reset()
    if (preExpect !== undefined) {
      // PRECONDITION probe — must be inside the region (it is a real read of
      // the state the op is about to act on) and must force layout, or the
      // reset's DOM work can be coalesced away by the browser and never happen.
      suite.container.getBoundingClientRect()
      preChecksum += probe(suite.container)
    }
    await fn()
    if (options.commit) await options.commit()
    // Force the layout flush ONCE PER CYCLE, not once per region.
    // Without this the browser coalesces 40 cycles' worth of style/layout into
    // a single flush at the end, so the batch measures DOM MUTATION ONLY while
    // the per-op path measures mutation + layout — different quantities, and
    // the batch reads ~7× too fast (measured: 1.19ms/cycle vs the ~8.6ms the
    // per-op instrument reports for the same build+clear work). Flushing per
    // cycle costs what the per-op path already pays, so the two agree.
    suite.container.getBoundingClientRect()
    checksum += probe(suite.container)
  }
  const elapsed = performance.now() - t0

  if (preExpect !== undefined && preChecksum !== preExpect * K) {
    throw new Error(
      `[bench] ${suite.framework}: batch PRECONDITION check failed — expected ` +
        `${preExpect * K} (${K} × ${preExpect}), got ${preChecksum}. The reset did not ` +
        `restore the state the op is supposed to act on, so the cycle did not measure it.`,
    )
  }
  if (expect !== undefined && checksum !== expect * K) {
    throw new Error(
      `[bench] ${suite.framework}: batch state check failed — expected ` +
        `checksum ${expect * K} (${K} cycles × ${expect} rows), got ${checksum}. ` +
        `At least one cycle did not reach the expected DOM state, so its timing ` +
        `is not a measurement of the op.`,
    )
  }
  return elapsed / K
}

/**
 * Batched variant of `bench`. Same warmup/RUNS/statistics shape, except each
 * "sample" is a K-cycle region mean rather than one timed op, so the reported
 * median/CI95 are per-cycle costs that do not depend on clock resolution.
 */
async function benchBatched(
  name: string,
  suite: BenchSuite,
  fn: () => void | Promise<void>,
  options: BenchOptions,
  K: number,
): Promise<BenchResult> {
  for (let w = 0; w < BATCH_WARMUP; w++) {
    await batchSample(suite, fn, options, K)
    forceGc()
    await tick()
  }

  const samples: number[] = []
  for (let i = 0; i < BATCH_RUNS; i++) {
    forceGc()
    samples.push(await batchSample(suite, fn, options, K))
    await tick()
  }

  const sorted = [...samples].sort((a, b) => a - b)
  const mean = samples.reduce((s, x) => s + x, 0) / samples.length
  const stddev = Math.sqrt(
    samples.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(samples.length - 1, 1),
  )
  const result: BenchResult = {
    name,
    median: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    runs: BATCH_RUNS,
    ci95: bootstrapCI95(samples),
    cv: mean > 0 ? stddev / mean : 0,
    warmupUsed: BATCH_WARMUP,
    samples: samples.slice(),
  }
  suite.results.push(result)
  return result
}

export async function bench(
  name: string,
  suite: BenchSuite,
  fn: () => void | Promise<void>,
  options: BenchOptions = {},
): Promise<BenchResult> {
  const K = options.batchK ?? 0
  if (K > 1) return benchBatched(name, suite, fn, options, K)
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
    samples: samples.slice(), // copy — caller may pool across runs
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
