/**
 * Tier-B form-bench harness — the framework-agnostic measurement core.
 *
 * This is the SAME methodology as `examples/benchmark/src/runner.ts` (the DOM
 * row-list bench), trimmed to the form domain:
 *  - adaptive warmup (rolling p90 within STABILIZE_TOLERANCE)
 *  - 20 timed runs, median + p90 + 95% bootstrap CI + CV
 *  - per-iteration reset hook (each timed run does REAL work)
 *  - per-iteration DOM verify (a framework that "wins" by not committing throws)
 *  - per-framework commit boundary inside the timed region (sync frameworks
 *    pay no scheduler floor; async ones use their tightest real flush)
 *  - forced GC between iterations when Chromium runs with --expose-gc
 *
 * The bench() signature is intentionally identical to the DOM bench's so the
 * objectivity discipline is shared verbatim, not re-derived.
 */

export interface BenchResult {
  name: string
  /** Median in ms across `runs` timed samples (warmup excluded). */
  median: number
  /** 90th percentile in ms — tail latency. */
  p90: number
  min: number
  max: number
  runs: number
  /** 95% bootstrap CI on the median (1000 resamples), in ms. */
  ci95: [number, number]
  /** Coefficient of variation (stddev/mean) — measurement stability. */
  cv: number
  warmupUsed: number
  /** Raw timed samples — surfaced so the driver can pool across --repeat N. */
  samples: number[]
}

export interface BenchSuite {
  framework: string
  container: HTMLElement
  results: BenchResult[]
}

export interface BenchOptions {
  /** Fired before each (warmup + timed) iteration — re-establish real work. */
  reset?: () => void | Promise<void>
  /** Verify the DOM after each iteration. Throw to fail. */
  verify?: (container: HTMLElement) => void
  /**
   * Per-framework commit boundary — inside the timed region, AFTER `fn()`,
   * BEFORE the layout flush. Synchronous frameworks omit it; React/Svelte
   * use `flushSync`, Vue `nextTick`, etc. See METHODOLOGY.md.
   */
  commit?: () => void | Promise<void>
}

export const WARMUP_MIN = 5
export const WARMUP_MAX = 15
export const STABILIZE_WINDOW = 3
export const STABILIZE_TOLERANCE = 0.1
/** Timed runs per scenario. `?runs=N` (the driver's `--runs`) overrides it for
 *  a quick correctness smoke — the gates run on every iteration either way. */
export const RUNS = (() => {
  const n = Number(new URLSearchParams(globalThis.location?.search ?? '').get('runs'))
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 20
})()
export const BOOTSTRAP_RESAMPLES = 1000

function forceGc(): void {
  ;(globalThis as { gc?: () => void }).gc?.()
}

/** Wall time spent inside `untimed()` during the current sample. */
let excludedMs = 0

/**
 * Run `fn` inside a timed region WITHOUT charging its wall time to the sample.
 * Exists for exactly one case: a library that defers its work behind a TIMER
 * (vee-validate debounces schema validation by a hard-coded 5ms). Waiting for
 * that timer inside the window would time idle, and not waiting lets 12
 * keystrokes coalesce into one validation — work no other column skips. The
 * cost of this shape is an UNDER-count for the arm that uses it (the deferred
 * work's CPU lands in the excluded span), which the arm must disclose.
 */
export async function untimed(fn: () => unknown): Promise<void> {
  const t = performance.now()
  await fn()
  excludedMs += performance.now() - t
}

export function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0))
}

export async function bench(
  name: string,
  suite: BenchSuite,
  fn: () => void | Promise<void>,
  options: BenchOptions = {},
): Promise<BenchResult> {
  // Adaptive warmup — keep warming until the rolling p90 stabilises.
  const warmupSamples: number[] = []
  let warmupUsed = 0
  while (warmupUsed < WARMUP_MAX) {
    if (options.reset) await options.reset()
    excludedMs = 0
    const t0 = performance.now()
    await fn()
    if (options.commit) await options.commit()
    suite.container.getBoundingClientRect()
    warmupSamples.push(performance.now() - t0 - excludedMs)
    warmupUsed++
    if (options.verify) options.verify(suite.container)
    forceGc()
    await tick()
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
    excludedMs = 0
    const t0 = performance.now()
    await fn()
    if (options.commit) await options.commit()
    suite.container.getBoundingClientRect()
    samples.push(performance.now() - t0 - excludedMs)
    if (options.verify) options.verify(suite.container)
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
    runs: RUNS,
    ci95: bootstrapCI95(samples),
    cv: mean > 0 ? stddev / mean : 0,
    warmupUsed,
    samples: samples.slice(),
  }
  suite.results.push(result)
  return result
}

/** Linear-interpolated quantile on a pre-sorted array. */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0] ?? 0
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo] ?? 0
  const frac = pos - lo
  return (sorted[lo] ?? 0) * (1 - frac) + (sorted[hi] ?? 0) * frac
}

/** 95% bootstrap CI on the median (1000 non-parametric resamples). */
function bootstrapCI95(samples: number[]): [number, number] {
  if (samples.length === 0) return [0, 0]
  if (samples.length === 1) return [samples[0] ?? 0, samples[0] ?? 0]
  const n = samples.length
  const medians: number[] = []
  for (let b = 0; b < BOOTSTRAP_RESAMPLES; b++) {
    const resample: number[] = []
    for (let i = 0; i < n; i++) resample.push(samples[Math.floor(Math.random() * n)] ?? 0)
    resample.sort((a, b2) => a - b2)
    medians.push(quantile(resample, 0.5))
  }
  medians.sort((a, b) => a - b)
  return [quantile(medians, 0.025), quantile(medians, 0.975)]
}

/**
 * One macrotask via `MessageChannel` — unlike `setTimeout(0)` it is not clamped
 * to 4ms once nested, so it adds a few µs, not a timer floor.
 */
export function macrotask(): Promise<void> {
  const ch = new MessageChannel()
  return new Promise((resolve) => {
    ch.port1.onmessage = () => {
      ch.port1.close()
      resolve()
    }
    ch.port2.postMessage(null)
  })
}

/**
 * Let one keystroke's ASYNC consequences land, identically in every column.
 *
 * Every library in this suite validates asynchronously — Pyreon's zod adapter
 * (`safeParseAsync`), `@hookform/resolvers`, Formik's `runValidations`,
 * vee-validate, Felte, modular-forms' `zodForm`. Before this existed the
 * `keystroke-change` timed region ended when the SYNC part of the input
 * handler returned, so each library's validation + error render ran partly or
 * wholly OUTSIDE the window, by an amount that depended on how the library
 * chains its promises — i.e. the column measured scheduling luck, and the gate
 * (`input.value === TYPED`, which `setInput` itself guarantees) could not
 * notice. A real user's keystrokes are separate tasks, so the honest model is:
 * dispatch, then let the task queue turn over before the next key.
 *
 * TWO macrotasks, not one: a React state update issued from a resolved promise
 * is scheduled on React's own `MessageChannel` task, which may be queued AFTER
 * the first yield; the second yield runs after it. The cost (a few µs × 2 per
 * keystroke) is the same additive floor in every column.
 */
export async function settle(): Promise<void> {
  await macrotask()
  await macrotask()
}
