/**
 * The verdict the heap audits (`leak-audit.ts`, `leak-sweep.ts`) reach from
 * their samples: is this growth a leak?
 *
 * Pure functions, no browser — the callers hand in the samples and a way to
 * take more.
 *
 * ## Why one window is not enough
 *
 * The audits fit a least-squares line through `usedJSHeapSize` after each
 * cycle and compare the slope with a bytes-per-cycle threshold. That reads a
 * SINGLE allocation as steady growth: one step of `S` bytes in the middle of
 * an `n`-sample window has slope `1.5·S·n / (n² − 1)`, about `S / 10` for the
 * sweep's 15 samples. A hash table that doubles once therefore reports a
 * "leak" of a tenth of its size per cycle although nothing grows afterwards.
 *
 * It is not hypothetical. `domConditionalToggle-1000` mounts and unmounts
 * 1,001 components per cycle while about 21,000 stay mounted from earlier
 * journeys. The dev component registry (`runtime-dom/src/devtools.ts`) keeps a
 * `Map` entry per mounted component; its live size is constant, but V8 only
 * rehashes a full `Map` in place when at least half its entries are deleted, so
 * the churn filled the 32,768-entry table once and it doubled: 458,752 bytes,
 * one time, reported as 47,197 bytes/cycle against a 50,000-byte threshold. A
 * second map with the same keys (#4476) made the step 917,504 bytes — 93,675
 * bytes/cycle, the sweep's "91 KB" — and the nightly sweep was red for six
 * nights over an allocation that happens once per page.
 *
 * One window cannot tell that step from the first visible step of a real leak:
 * a container that grows geometrically shows a leak of table-only entries
 * (integer keys, shared values) as exactly such isolated steps.
 *
 * ## The rule
 *
 * A container that just grew by `G` bytes has at least `G` bytes of free
 * capacity (that is what geometric growth means: the new block minus the old
 * one). A journey that leaks `r` bytes per cycle into it must make it grow
 * again within `G / r` cycles. So after a window whose slope exceeds the
 * threshold `τ`, keep running the same journey for
 *
 *     m = 2 · ⌈G / τ⌉   cycles, `G` = the window's heap range
 *
 * and fit a line through those `m` samples alone. A one-time allocation
 * leaves that window flat, so its slope is zero. A real leak at any rate from
 * `τ` up — linear, or amortized through a geometric container — has its next
 * growth inside the first half of the window, where a step carries weight; a
 * least-squares fit over step-shaped growth still under-reads the true rate,
 * by up to 45% over the model grid in `leak-verdict.test.ts` (rates from τ,
 * growth factors 1.25 to 2, every fill level). The window is therefore
 * cleared only when the confirmation slope is at most `τ / 2`: between the
 * zero of a one-time step and the 0.55 τ floor of a real leak. The threshold
 * for the first window is unchanged.
 *
 * Growth too large to confirm within `maxCycles` (`m > maxCycles`) is a leak
 * without further sampling: with the defaults (τ = 50 KB, 120 cycles) that is
 * any window whose heap range exceeds 3 MB.
 */

/**
 * Least-squares linear regression on (x, y) samples. x is the sample index
 * (0..n-1); y is the value.
 *
 * Returns `{ slope, intercept, rSquared }`:
 *   - `slope` — value change per unit x (bytes per cycle for the heap audits)
 *   - `intercept` — predicted y at x=0
 *   - `rSquared` — coefficient of determination ∈ [0, 1]. 1.0 means
 *     perfect line; 0 means the line explains no variance. NaN-safe:
 *     returns 0 when total variance is 0 (constant samples).
 */
export function linearRegression(samples: number[]): {
  slope: number
  intercept: number
  rSquared: number
} {
  const n = samples.length
  if (n < 2) return { slope: 0, intercept: samples[0] ?? 0, rSquared: 0 }
  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumX2 = 0
  for (let i = 0; i < n; i++) {
    sumX += i
    sumY += samples[i]!
    sumXY += i * samples[i]!
    sumX2 += i * i
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n
  // Low rSquared means the heap is jittery (noise > trend): the slope
  // estimate is uncertain even if it is small.
  const meanY = sumY / n
  let ssTotal = 0
  let ssRes = 0
  for (let i = 0; i < n; i++) {
    const yPred = intercept + slope * i
    ssTotal += (samples[i]! - meanY) ** 2
    ssRes += (samples[i]! - yPred) ** 2
  }
  const rSquared = ssTotal > 0 ? 1 - ssRes / ssTotal : 0
  return { slope, intercept, rSquared }
}

/** Default cap on confirmation cycles: clears a one-time allocation of up to `maxCycles · τ / 2`. */
export const DEFAULT_MAX_CONFIRM_CYCLES = 120

/**
 * How many further cycles decide whether an over-threshold window is a leak:
 * `2 · ⌈range / threshold⌉`, never fewer than the window itself. `0` means
 * "do not confirm, it is a leak": the growth is too large to clear within
 * `maxCycles` (and `maxCycles = 0` switches confirmation off).
 */
export function confirmationCycles(
  samples: number[],
  threshold: number,
  maxCycles: number,
): number {
  if (samples.length === 0 || threshold <= 0) return 0
  let min = samples[0]!
  let max = min
  for (const s of samples) {
    if (s < min) min = s
    if (s > max) max = s
  }
  const need = Math.max(2 * Math.ceil((max - min) / threshold), samples.length)
  return need > maxCycles ? 0 : need
}

export type HeapGrowthReason =
  /** The window's slope is within the threshold. */
  | 'within-threshold'
  /** Over the threshold, and still growing (above half of it) through the confirmation cycles. */
  | 'confirmed-leak'
  /** Over the threshold, by more than the confirmation budget can clear. */
  | 'too-large-to-confirm'
  /** Over the threshold once, then flat: a one-time allocation, not growth. */
  | 'one-time-step'

export interface HeapGrowthVerdict {
  leak: boolean
  reason: HeapGrowthReason
  /** Regression over the first window. */
  slope: number
  intercept: number
  rSquared: number
  /** Present when confirmation cycles ran. */
  confirmation?: { cycles: number; slope: number; rSquared: number; samples: number[] }
}

/**
 * Judge one journey's heap samples. `sampleMore(cycles)` runs that many
 * further cycles of the same journey and returns their samples; it is called
 * at most once, and only when the first window exceeds the threshold.
 */
export async function judgeHeapGrowth(
  samples: number[],
  threshold: number,
  maxConfirmCycles: number,
  sampleMore: (cycles: number) => Promise<number[]> | number[],
): Promise<HeapGrowthVerdict> {
  const { slope, intercept, rSquared } = linearRegression(samples)
  if (!(slope > threshold)) {
    return { leak: false, reason: 'within-threshold', slope, intercept, rSquared }
  }
  const cycles = confirmationCycles(samples, threshold, maxConfirmCycles)
  if (cycles === 0) {
    return { leak: true, reason: 'too-large-to-confirm', slope, intercept, rSquared }
  }
  const more = await sampleMore(cycles)
  const fit = linearRegression(more)
  const leak = fit.slope > threshold / 2
  return {
    leak,
    reason: leak ? 'confirmed-leak' : 'one-time-step',
    slope,
    intercept,
    rSquared,
    confirmation: { cycles, slope: fit.slope, rSquared: fit.rSquared, samples: more },
  }
}
