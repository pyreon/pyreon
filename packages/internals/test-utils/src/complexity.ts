/**
 * Load-independent complexity assertions.
 *
 * WHY THIS EXISTS
 *
 * A unit test that guards an algorithm's COMPLEXITY cannot do it with an
 * absolute wall-clock budget. `expect(elapsed).toBeLessThan(50)` fails two ways:
 *
 * 1. **It flakes.** The number is measured on an idle machine and then asserted
 *    on a loaded one. Every such assertion in this repo was authored WITH a
 *    comment acknowledging CI noise and a deliberately loose threshold — and
 *    they still flake, because no absolute number is load-proof. The ws-relay
 *    timeout saga escalated 8s → 15s → 20s → 30s and was outrun each time; the
 *    fix there was to stop guessing a number and derive it. Same lesson here,
 *    one step further: derive nothing, compare two measurements instead.
 *
 * 2. **It misses the bug it targets.** A threshold sized for an idle machine is
 *    slack enough that a genuinely QUADRATIC implementation can slip under it on
 *    fast hardware. The assertion passes precisely when the machine is quick,
 *    which is backwards.
 *
 * THE FIX
 *
 * Measure the same operation at two input sizes IN THE SAME PROCESS, back to
 * back, and assert on the RATIO. Contention, CPU speed, thermal state and GC
 * pressure hit both measurements, so they cancel. What survives is the growth
 * curve — which is the invariant these tests were always trying to state.
 *
 * For a scale factor k:  linear ⇒ ratio ≈ k · quadratic ⇒ ratio ≈ k².
 * The default bound sits between them, nearer the quadratic end so that ordinary
 * constant-factor noise cannot fail a linear implementation.
 */

export interface ComplexityOptions {
  /**
   * How much larger the second input is. Default 8 — far enough apart that
   * linear (≈8×) and quadratic (≈64×) are unmistakable.
   */
  scale?: number
  /**
   * Maximum tolerated ratio. Default `scale * 3`, i.e. 24 at the default scale:
   * three times the linear expectation, but still only ~⅜ of quadratic.
   */
  maxRatio?: number
  /**
   * Repetitions per size; the FASTEST is used. A minimum is far more stable
   * than a mean under contention — a scheduler steal can only ever make a
   * sample slower, so the floor is the cleanest estimate of real cost.
   */
  samples?: number
  /**
   * Minimum milliseconds the small run must take before the ratio is trusted.
   * Below this, timer granularity dominates and the ratio is noise. The helper
   * grows the base size until the run is measurable. Default 1.
   */
  minMs?: number
  /** Shown in the failure message. */
  label?: string
}

function timeBest(run: (n: number) => void, n: number, samples: number): number {
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < samples; i++) {
    const t0 = performance.now()
    run(n)
    const dt = performance.now() - t0
    if (dt < best) best = dt
  }
  return best
}

export interface ComplexityResult {
  baseN: number
  scaledN: number
  baseMs: number
  scaledMs: number
  ratio: number
  maxRatio: number
  ok: boolean
  /** Human-readable verdict, suitable as an assertion message. */
  detail: string
}

/**
 * Measure `run` at `baseN` and `baseN * scale` and report the growth ratio.
 *
 * Pure measurement — no assertion. Use when a test wants to inspect the numbers
 * itself; otherwise prefer {@link expectSubQuadratic}.
 */
export function measureComplexity(
  run: (n: number) => void,
  baseN: number,
  options: ComplexityOptions = {},
): ComplexityResult {
  const scale = options.scale ?? 8
  const maxRatio = options.maxRatio ?? scale * 3
  const samples = options.samples ?? 5
  const minMs = options.minMs ?? 1

  // Grow the base until the small run is above timer granularity, or we give up.
  // Without this a sub-microsecond op yields ratio = 0/0 and the test asserts
  // nothing while appearing to pass — the fabricated-pass class.
  // 24 doublings takes n=1 past 16M, which is comfortably over 1ms for even a
  // trivial per-item body. A smaller budget silently gives up on cheap
  // operations and reports UNMEASURABLE for inputs that are merely small.
  let n = baseN
  let baseMs = timeBest(run, n, samples)
  for (let i = 0; i < 24 && baseMs < minMs; i++) {
    n *= 2
    baseMs = timeBest(run, n, samples)
  }

  const scaledN = n * scale
  let scaledMs = timeBest(run, scaledN, samples)
  let ratio = baseMs > 0 ? scaledMs / baseMs : Number.POSITIVE_INFINITY

  // min-of-K is stable in the mean but not immune: a scheduler steal landing on
  // EVERY scaled sample while the base got a clean run inflates the ratio. That
  // made this helper itself flaky under full-suite saturation — unacceptable in
  // the tool whose whole purpose is removing timing flakes.
  //
  // So a breach is not trusted on first sight: re-measure BOTH sizes with 3x the
  // samples and use that. A genuinely quadratic function stays far past the
  // bound under any sampling, while contention noise averages out. One retry
  // only, so a real regression still fails fast.
  if (baseMs >= minMs && ratio > maxRatio) {
    const retrySamples = samples * 3
    const baseRetry = timeBest(run, n, retrySamples)
    const scaledRetry = timeBest(run, scaledN, retrySamples)
    if (baseRetry > 0) {
      baseMs = baseRetry
      scaledMs = scaledRetry
      ratio = scaledRetry / baseRetry
    }
  }

  const ok = baseMs >= minMs && ratio <= maxRatio

  const detail =
    `${options.label ?? 'operation'}: n=${n} took ${baseMs.toFixed(3)}ms, ` +
    `n=${scaledN} (${scale}x) took ${scaledMs.toFixed(3)}ms — ` +
    `ratio ${ratio.toFixed(2)} (linear≈${scale}, quadratic≈${scale * scale}, ` +
    `bound ${maxRatio})` +
    (baseMs < minMs
      ? ` [UNMEASURABLE: base run under ${minMs}ms even after growth — ratio not trustworthy]`
      : '')

  return { baseN: n, scaledN, baseMs, scaledMs, ratio, maxRatio, ok, detail }
}

/**
 * Assert that `run` does not grow quadratically with its input.
 *
 * Load-independent: both measurements happen back to back in the same process,
 * so machine speed and contention cancel out of the ratio.
 *
 * ```ts
 * expectSubQuadratic((n) => isMarkdownId('#'.repeat(n) + 'foo'), 10_000, {
 *   label: 'isMarkdownId',
 * })
 * ```
 *
 * Throws with the full measurement detail on failure, so a CI log says which
 * curve was observed rather than only that a number was exceeded.
 */
export function expectSubQuadratic(
  run: (n: number) => void,
  baseN: number,
  options: ComplexityOptions = {},
): ComplexityResult {
  const result = measureComplexity(run, baseN, options)
  if (!result.ok) {
    throw new Error(
      `[Pyreon] expected sub-quadratic growth but measured ${result.detail}`,
    )
  }
  return result
}
