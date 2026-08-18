/**
 * Bimodality guard — refuses to publish a median that was decided by an
 * artifact mode rather than by the operation's cost.
 *
 * ## The defect this exists to catch
 *
 * A churn-heavy bench sited before a measured op leaves residue (Blink-side
 * DOM/layout state, not JS heap — a forced `gc()` measurably does NOT clear
 * it). The following op's samples then go BIMODAL: a clean mode at the op's
 * true cost and a slow mode two-to-three times higher. Which mode holds the
 * median is then a function of the residue's FREQUENCY, not of the op, and
 * because that frequency differs per framework the cross-framework comparison
 * silently compares different modes.
 *
 * That shipped: a run reported `outright React 19` on `append` with Vanilla at
 * 48.72ms — hand-written DOM losing 2.2x to React at appending. It was caught
 * by a human noticing the implausibility. Every existing correctness gate
 * validates WITHIN an op (did the DOM reach the expected state?); nothing
 * checked that an op had not been perturbed by its neighbours.
 *
 * ## The statistic
 *
 * Perturbation can only ever make an op SLOWER. So when the samples separate
 * into well-defined modes, the operation's true cost is the FASTEST one, and
 * the question to ask of a reported median is simply: is it in that mode?
 *
 *     capture = median / fastModeCentre
 *
 * `capture` is ~1.0 while the median sits in the fast mode and jumps to ~the
 * mode ratio (>= 1.5 by construction, see `SEP_RATIO`) the moment it crosses
 * into a slow one. There is no smooth region between those two states, which
 * is why the threshold is not a sensitive tuning knob — see THRESHOLDS below.
 *
 * ## Why a naive min-vs-median rule does not work
 *
 * The obvious heuristic — flag when min and median diverge by more than ~2x —
 * false-positives across the whole sub-millisecond half of this suite.
 * `performance.now()` is quantized (100us clamped, 5us cross-origin-isolated),
 * so an op costing one or two ticks has min 0 and median one tick: a ratio of
 * infinity with nothing wrong. Measured on this suite's own data, `select row`
 * produces med/min of `inf` and `3.00` while being perfectly healthy.
 */

/** One measured cell: all pooled samples for a single (framework, op) pair. */
export interface SampleCell {
  op: string
  framework: string
  /** Pooled timing samples, milliseconds. Order irrelevant. */
  samples: readonly number[]
}

export type BimodalStatus =
  /** Too few samples, or median too near the clock quantum to judge. */
  | 'skipped'
  /** No well-separated second mode. */
  | 'unimodal'
  /** Two real modes, but the median is safely inside the fast one. */
  | 'disclosed'
  /**
   * Two real modes with the slow one near half the mass: the median is real
   * but which mode holds it is close to a coin flip, so it will move run to
   * run. Reported, NOT blocking — see `knifeEdgeShare`.
   */
  | 'unstable'
  /** The reported median is not a measurement of this op. */
  | 'failed'

export interface BimodalFinding {
  op: string
  framework: string
  status: BimodalStatus
  /** Why it failed — empty unless `status === 'failed'`. */
  reason: 'captured-median' | 'knife-edge' | null
  median: number
  /** Centre of the fastest well-separated mode = the op's true cost. */
  fastModeCentre: number
  /** `median / fastModeCentre`. ~1.0 when healthy. */
  capture: number
  /** Fraction of samples in the slow mode(s). */
  slowModeShare: number
  /** Ratio between the two mode centres. */
  modeSeparation: number
  /** Absolute width of the void between the modes, milliseconds. */
  gap: number
}

export interface GuardThresholds {
  /**
   * The void between modes must exceed this many clock quanta. Kills the
   * quantized-op false positive: a one-tick spread is rounding, not a mode.
   */
  gapQuanta: number
  /**
   * THE load-bearing criterion. A gap is a mode boundary only if it is wider
   * than the spread WITHIN the clusters it separates. Without this, the
   * largest-gap rule calls any skewed-but-continuous distribution bimodal —
   * measured: Preact's `clear rows` is a smooth 0.52-0.85ms continuum with an
   * 8-sample low tail, which the rule alone mis-flagged with capture 2.39.
   * Spread is p90-p10 (robust; defined for small clusters).
   */
  gapMustExceedClusterSpread: boolean
  /** Modes must be this far apart in RATIO to count as different costs. */
  sepRatio: number
  /** Each mode needs this share of samples — a lone outlier is not a mode. */
  minModeMass: number
  /**
   * To claim a median is CAPTURED, the fast mode must itself be credible as
   * the op's typical cost. A cluster holding only a few percent of samples is
   * a lucky-scheduling tail, not a cost — measured: Preact's `clear rows` puts
   * ~7% of samples 2.2x below the rest, and without this floor the guard
   * "corrects" a healthy 770µs median to a 350µs best case. Cells that are
   * bimodal but whose fast mode is too thin to trust are DISCLOSED, not failed.
   */
  minFastModeMassForCapture: number
  /** `capture` at or above this fails: the median is in an artifact mode. */
  captureMax: number
  /**
   * Slow-mode share at or above this marks the median UNSTABLE (reported, not
   * blocking) even when it is currently in the fast mode.
   *
   * Deliberately non-blocking. At a ~50% straddle the guard cannot tell
   * harness residue from a framework's own variance, and it was measured
   * getting exactly that wrong: React's `clear rows` sat at 19% slow in one
   * run and 50% in the next with no harness change. Blocking an eight-way
   * field run on an ambiguous signal is the wrong trade, whereas a CAPTURED
   * median is unambiguous and does block. The harm here is also bounded — at
   * just under half, the median sits at the top of the fast mode, so the value
   * is inflated rather than wrong by the full mode ratio; the moment it
   * crosses, `captureMax` fires.
   */
  knifeEdgeShare: number
  /** Below this many quanta the guard cannot discriminate; the cell is skipped. */
  medianFloorQuanta: number
  /** Fewer samples than this and cluster mass is not estimable. */
  minSamples: number
}

/**
 * THRESHOLDS — calibrated against this suite's real samples, not guessed.
 *
 * Measured `capture`, 8 frameworks x 11 ops, cross-origin-isolated (5us):
 *
 *   fixed ordering    all genuinely-bimodal cells    1.004 .. 1.033
 *   pre-fix ordering  the 4 impls carrying the batch 2.660 .. 2.810
 *   pre-fix ordering  the 3 impls without it         1.002 .. 1.006
 *
 * The band (1.033, 2.660) is EMPTY, so any threshold inside it behaves
 * identically. `captureMax` sits at 1.25 — ~21% above the observed healthy
 * maximum, ~2.1x below the observed corrupted minimum.
 *
 * BIAS: toward the false POSITIVE. A false positive costs one re-run of a
 * bench; a false negative shipped a wrong published verdict and voided an op.
 * `knifeEdgeShare` is the tighter of the two margins (observed healthy max is
 * 0.35, threshold 0.45) and is the more likely of the two to fire spuriously.
 * If it does, the correct response is to fix the contamination, not to raise
 * the threshold.
 */
export const DEFAULT_THRESHOLDS: GuardThresholds = {
  gapQuanta: 4,
  gapMustExceedClusterSpread: true,
  sepRatio: 1.5,
  minModeMass: 0.05,
  // Observed fast-mode mass when the defect was live: 27-30% across the four
  // affected impls (and 20% in the originally-reported incident). Observed for
  // the thin-tail false positive: 7-8%. 15% sits between them.
  minFastModeMassForCapture: 0.15,
  captureMax: 1.25,
  knifeEdgeShare: 0.45,
  medianFloorQuanta: 40,
  minSamples: 20,
}

function quantile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0
  const i = Math.floor((sorted.length - 1) * p)
  return sorted[Math.min(sorted.length - 1, Math.max(0, i))] ?? 0
}

/**
 * Inspect one cell. Pure: no I/O, no clock, no globals — the whole point is
 * that this is unit-testable against synthetic distributions.
 *
 * @param quantumMs measured clock granularity, milliseconds. MUST be the value
 *   the harness probed at runtime, not an assumption: the same page reads
 *   100us un-isolated and 5us with COOP+COEP, and using the wrong one moves
 *   every quantum-scaled threshold by 20x.
 */
export function inspectCell(
  cell: SampleCell,
  quantumMs: number,
  thresholds: GuardThresholds = DEFAULT_THRESHOLDS,
): BimodalFinding {
  const sorted = [...cell.samples].sort((a, b) => a - b)
  const n = sorted.length
  const median = quantile(sorted, 0.5)
  const base = {
    op: cell.op,
    framework: cell.framework,
    reason: null,
    median,
    fastModeCentre: median,
    capture: 1,
    slowModeShare: 0,
    modeSeparation: 1,
    gap: 0,
  } as const

  if (n < thresholds.minSamples) return { ...base, status: 'skipped' }
  if (median < thresholds.medianFloorQuanta * quantumMs) return { ...base, status: 'skipped' }

  // Widest consecutive gap = the candidate mode boundary.
  let gap = 0
  let splitAt = -1
  for (let i = 1; i < n; i++) {
    const g = (sorted[i] ?? 0) - (sorted[i - 1] ?? 0)
    if (g > gap) {
      gap = g
      splitAt = i
    }
  }
  if (splitAt < 0) return { ...base, status: 'unimodal' }

  const lo = sorted.slice(0, splitAt)
  const hi = sorted.slice(splitAt)
  const loCentre = quantile(lo, 0.5)
  const hiCentre = quantile(hi, 0.5)
  const widestClusterSpread = Math.max(
    quantile(lo, 0.9) - quantile(lo, 0.1),
    quantile(hi, 0.9) - quantile(hi, 0.1),
  )
  const modeSeparation = loCentre > 0 ? hiCentre / loCentre : Number.POSITIVE_INFINITY
  const loMass = lo.length / n
  const slowModeShare = hi.length / n

  const isRealBoundary =
    gap >= thresholds.gapQuanta * quantumMs &&
    (!thresholds.gapMustExceedClusterSpread || gap > widestClusterSpread) &&
    modeSeparation >= thresholds.sepRatio &&
    Math.min(loMass, slowModeShare) >= thresholds.minModeMass

  if (!isRealBoundary) {
    return { ...base, status: 'unimodal', gap, modeSeparation, slowModeShare }
  }

  const capture = loCentre > 0 ? median / loCentre : 1
  const detail = {
    ...base,
    fastModeCentre: loCentre,
    capture,
    slowModeShare,
    modeSeparation,
    gap,
  }

  if (capture >= thresholds.captureMax && loMass >= thresholds.minFastModeMassForCapture) {
    return { ...detail, status: 'failed', reason: 'captured-median' }
  }
  // Median is in a slow mode, but the fast mode is too thin to be called this
  // op's cost. Surfacing beats both alternatives: failing would "correct" a
  // healthy median to a best-case tail, and staying silent would hide a real
  // second mode from anyone reading the CI95.
  if (capture >= thresholds.captureMax) {
    return { ...detail, status: 'disclosed' }
  }
  if (slowModeShare >= thresholds.knifeEdgeShare) {
    return { ...detail, status: 'unstable', reason: 'knife-edge' }
  }
  return { ...detail, status: 'disclosed' }
}

export interface GuardReport {
  findings: BimodalFinding[]
  /** Blocking: the median is an artifact mode. */
  failures: BimodalFinding[]
  /** Non-blocking but loud: the median will move run to run. */
  unstable: BimodalFinding[]
  /** Non-blocking: a real second mode the CI95/CV do not represent well. */
  disclosures: BimodalFinding[]
  /** True when nothing was measurable — an empty audit is never a pass. */
  emptyAudit: boolean
}

/**
 * Audit every cell. Mirrors the repo's aggregate-gate rule: failures are
 * surfaced individually and named, and an audit that measured NOTHING reports
 * `emptyAudit` rather than a clean bill of health.
 */
export function auditCells(
  cells: readonly SampleCell[],
  quantumMs: number,
  thresholds: GuardThresholds = DEFAULT_THRESHOLDS,
): GuardReport {
  const findings = cells.map((c) => inspectCell(c, quantumMs, thresholds))
  const judged = findings.filter((f) => f.status !== 'skipped')
  return {
    findings,
    failures: findings.filter((f) => f.status === 'failed'),
    unstable: findings.filter((f) => f.status === 'unstable'),
    disclosures: findings.filter((f) => f.status === 'disclosed'),
    emptyAudit: judged.length === 0,
  }
}

function fmt(ms: number): string {
  return ms < 1 ? `${(ms * 1000).toFixed(0)}µs` : `${ms.toFixed(2)}ms`
}

/** Render the report for the console. Returns the lines; caller decides stream. */
export function formatGuardReport(report: GuardReport, quantumMs: number): string[] {
  const out: string[] = []
  out.push('')
  out.push('Bimodality guard — is each median a measurement, or an artifact mode?')
  out.push('─'.repeat(120))

  if (report.emptyAudit) {
    out.push('  ✗ NOTHING MEASURED — no cell had enough samples above the clock floor to judge.')
    out.push('    An empty audit is not a pass. Check sample counts and the measured quantum.')
    return out
  }

  if (report.disclosures.length > 0) {
    out.push(
      `  Bimodal, median NOT failed (${report.disclosures.length} cell(s)) — ` +
        'CI95 and CV from these cells are inflated by the second mode:',
    )
    for (const d of report.disclosures) {
      const thinTail = d.capture >= DEFAULT_THRESHOLDS.captureMax
      out.push(
        `    · ${d.op} / ${d.framework}: median ${fmt(d.median)}, ` +
          `fast mode ${fmt(d.fastModeCentre)} holding ` +
          `${((1 - d.slowModeShare) * 100).toFixed(0)}% of samples, ` +
          `separation ${d.modeSeparation.toFixed(1)}×` +
          (thinTail
            ? ' — fast mode too thin to call it this op\'s cost, so the median stands'
            : ' — median is in the fast mode'),
      )
    }
  }

  for (const u of report.unstable) {
    out.push(
      `  ! ${u.op} / ${u.framework}: MEDIAN ON A KNIFE EDGE (not blocking). ` +
        `${(u.slowModeShare * 100).toFixed(0)}% of samples are in a ${u.modeSeparation.toFixed(1)}× ` +
        `slow mode (≥ ${(DEFAULT_THRESHOLDS.knifeEdgeShare * 100).toFixed(0)}%), so which mode ` +
        `decides the median is close to a coin flip and it will move run to run. ` +
        `Median ${fmt(u.median)}, fast mode ${fmt(u.fastModeCentre)}. ` +
        `Do not publish a ratio for this cell without re-measuring.`,
    )
  }

  if (report.failures.length === 0) {
    out.push(
      `  ✓ no median captured by an artifact mode (clock quantum ${fmt(quantumMs)})` +
        (report.unstable.length > 0 ? ` — ${report.unstable.length} unstable cell(s) above` : ''),
    )
    return out
  }

  out.push('')
  for (const f of report.failures) {
    out.push(
      `  ✗ ${f.op} / ${f.framework}: MEDIAN CAPTURED BY AN ARTIFACT MODE. ` +
        `Reported ${fmt(f.median)}, but the op's true cost is ${fmt(f.fastModeCentre)} ` +
        `(capture ${f.capture.toFixed(2)}× ≥ ${DEFAULT_THRESHOLDS.captureMax}). ` +
        `${(f.slowModeShare * 100).toFixed(0)}% of samples sit in a ${f.modeSeparation.toFixed(1)}× ` +
        `slow mode across a ${fmt(f.gap)} void.`,
    )
  }
  out.push('')
  out.push(
    '  A churn-heavy op leaves Blink-side residue that a forced gc() does NOT clear. ' +
      'Ordering is the isolation mechanism: move the churn-heavy bench AFTER the affected op.',
  )
  return out
}
