import { describe, expect, it } from 'vitest'
import {
  auditCells,
  DEFAULT_THRESHOLDS,
  formatGuardReport,
  inspectCell,
  type SampleCell,
} from '../../../../../examples/benchmark/bimodality-guard'

/**
 * The guard exists because a churn-heavy bench sited before a measured op left
 * residue that made the following op's samples bimodal, so the median reported
 * WHICH MODE WON rather than the op's cost. Published output read
 * `outright React 19` on append with Vanilla at 48.72ms.
 *
 * Distributions below are the real measured shapes, cross-origin-isolated
 * (5µs quantum), 100 pooled samples.
 */
const QUANTUM = 0.005

function cell(op: string, framework: string, samples: number[]): SampleCell {
  return { op, framework, samples }
}

/** Evenly spread `n` samples across [lo, hi] — a tight unimodal cluster. */
function spread(n: number, lo: number, hi: number): number[] {
  if (n === 1) return [lo]
  const step = (hi - lo) / (n - 1)
  return Array.from({ length: n }, (_, i) => lo + i * step)
}

describe('bimodality guard — healthy distributions must not fire', () => {
  it('passes a tight unimodal op', () => {
    const f = inspectCell(cell('create 1,000', 'Pyreon', spread(100, 8.0, 8.9)), QUANTUM)
    expect(f.status).toBe('unimodal')
    expect(f.reason).toBeNull()
  })

  it('passes a SKEWED unimodal op with a small fast tail', () => {
    // Preact `clear rows`, measured: 8 samples at 0.30-0.385 then a smooth
    // 0.52-0.845 continuum. The largest CONSECUTIVE gap here is 0.135ms and a
    // naive largest-gap rule called this bimodal with capture 2.39. It is not
    // bimodal: the gap is SMALLER than the spread inside the upper cluster.
    const samples = [
      0.3, 0.31, 0.31, 0.31, 0.34, 0.37, 0.38, 0.385,
      ...spread(92, 0.52, 0.845),
    ]
    const f = inspectCell(cell('clear rows', 'Preact', samples), QUANTUM)
    expect(f.status).toBe('unimodal')
  })

  it('the cluster-spread criterion is what rejects it — flipping ONLY that flag re-introduces the false positive', () => {
    const samples = [
      0.3, 0.31, 0.31, 0.31, 0.34, 0.37, 0.38, 0.385,
      ...spread(92, 0.52, 0.845),
    ]
    // Hold every other threshold constant (mass floor lowered in BOTH arms so
    // it cannot be the discriminator) and flip only the tightness criterion.
    const permissive = { ...DEFAULT_THRESHOLDS, minFastModeMassForCapture: 0.05 }
    expect(inspectCell(cell('clear rows', 'Preact', samples), QUANTUM, permissive).status).toBe(
      'unimodal',
    )
    expect(
      inspectCell(cell('clear rows', 'Preact', samples), QUANTUM, {
        ...permissive,
        gapMustExceedClusterSpread: false,
      }).status,
    ).toBe('failed')
  })

  it('does not fire on a QUANTIZED sub-millisecond op (the naive min-vs-median trap)', () => {
    // `select row`: true cost ~1 tick. min is 0, median is one quantum, so
    // median/min is infinite while nothing is wrong.
    const samples = [...Array.from({ length: 40 }, () => 0), ...Array.from({ length: 60 }, () => 0.005)]
    const f = inspectCell(cell('select row', 'Pyreon', samples), QUANTUM)
    expect(f.status).toBe('skipped')
  })

  it('does not fire on a single slow outlier — one sample is not a mode', () => {
    const samples = [...spread(99, 18.0, 20.0), 55.0]
    const f = inspectCell(cell('append', 'Pyreon', samples), QUANTUM)
    expect(f.status).toBe('unimodal')
  })

  it('skips a cell with too few samples rather than guessing', () => {
    const f = inspectCell(cell('append', 'Pyreon', spread(8, 18, 20)), QUANTUM)
    expect(f.status).toBe('skipped')
  })

  it('does not "correct" a healthy median down to a THIN fast tail', () => {
    // Preact `clear rows`, measured live: ~7% of samples sit 2.2× below the
    // rest. Without the fast-mode mass floor the guard failed this cell and
    // announced the op's "true cost" was the 350µs best case rather than the
    // 770µs typical one — a false positive that would block a legitimate run.
    const samples = [...spread(7, 0.30, 0.385), ...spread(93, 0.72, 0.82)]
    const f = inspectCell(cell('clear rows', 'Preact', samples), QUANTUM)
    expect(f.status).toBe('disclosed')
    expect(f.reason).toBeNull()
    // Still surfaced rather than hidden: the second mode is real.
    expect(f.capture).toBeGreaterThan(DEFAULT_THRESHOLDS.captureMax)
  })

  it('the fast-mode mass floor is what rejects it — lowering the floor re-fails the cell', () => {
    const samples = [...spread(7, 0.30, 0.385), ...spread(93, 0.72, 0.82)]
    const f = inspectCell(cell('clear rows', 'Preact', samples), QUANTUM, {
      ...DEFAULT_THRESHOLDS,
      minFastModeMassForCapture: 0.05,
    })
    expect(f.status).toBe('failed')
    expect(f.reason).toBe('captured-median')
  })
})

describe('bimodality guard — the shipped defect must fire', () => {
  /** Pyreon append, pre-fix ordering: ~32% fast at ~18ms, rest at ~49ms. */
  const capturedSamples = [...spread(32, 16.4, 19.7), ...spread(68, 41.2, 53.0)]

  it('fails a median captured by an artifact mode, and names the true cost', () => {
    const f = inspectCell(cell('append 1,000 to 10,000 rows', 'Pyreon', capturedSamples), QUANTUM)
    expect(f.status).toBe('failed')
    expect(f.reason).toBe('captured-median')
    // Reported median is in the slow mode; true cost is the fast mode centre.
    expect(f.median).toBeGreaterThan(40)
    expect(f.fastModeCentre).toBeLessThan(20)
    expect(f.capture).toBeGreaterThan(2)
  })

  it('does NOT fail the frameworks that carried no churn bench, in the same run', () => {
    // React/Preact/Svelte kept 90% of samples fast even pre-fix: their medians
    // were never captured, which is exactly why the corrupted run still looked
    // plausible for them.
    const f = inspectCell(
      cell('append 1,000 to 10,000 rows', 'React 19', [...spread(90, 20.1, 23.0), ...spread(10, 41, 49)]),
      QUANTUM,
    )
    expect(f.status).toBe('disclosed')
    expect(f.capture).toBeLessThan(DEFAULT_THRESHOLDS.captureMax)
  })

  it('marks a knife-edge median unstable — reported, but NOT blocking', () => {
    // 46% of samples slow: the median is decided by a near coin flip. This is
    // deliberately non-blocking; the guard cannot tell harness residue from a
    // framework's own variance here (React's `clear rows` measured 19% slow in
    // one run and 50% in the next), and blocking a whole field run on an
    // ambiguous signal is the wrong trade.
    const f = inspectCell(
      cell('append', 'Vanilla JS', [...spread(54, 18.0, 20.0), ...spread(46, 41.0, 49.0)]),
      QUANTUM,
    )
    expect(f.status).toBe('unstable')
    expect(f.reason).toBe('knife-edge')

    const report = auditCells(
      [cell('append', 'Vanilla JS', [...spread(54, 18.0, 20.0), ...spread(46, 41.0, 49.0)])],
      QUANTUM,
    )
    expect(report.failures).toHaveLength(0)
    expect(report.unstable).toHaveLength(1)
    expect(formatGuardReport(report, QUANTUM).join('\n')).toContain('KNIFE EDGE')
  })

  it('discloses a bimodal-but-safe cell without failing it', () => {
    const f = inspectCell(
      cell('append', 'Pyreon', [...spread(90, 16.4, 19.7), ...spread(10, 41.2, 49.4)]),
      QUANTUM,
    )
    expect(f.status).toBe('disclosed')
    expect(f.reason).toBeNull()
    expect(f.slowModeShare).toBeCloseTo(0.1, 2)
  })
})

describe('bimodality guard — threshold insensitivity', () => {
  it('capture is near-discontinuous, so any threshold in the empty band behaves the same', () => {
    const captured = [...spread(32, 16.4, 19.7), ...spread(68, 41.2, 53.0)]
    const healthy = [...spread(90, 16.4, 19.7), ...spread(10, 41.2, 49.4)]
    for (const captureMax of [1.1, 1.25, 1.4, 1.8, 2.4]) {
      const t = { ...DEFAULT_THRESHOLDS, captureMax, knifeEdgeShare: 1.1 }
      expect(inspectCell(cell('append', 'A', captured), QUANTUM, t).status).toBe('failed')
      expect(inspectCell(cell('append', 'B', healthy), QUANTUM, t).status).toBe('disclosed')
    }
  })

  it('uses the QUANTUM it is given — a 20x wrong quantum changes the verdict', () => {
    // Guards against the harness passing an assumed 100µs when the page is
    // isolated at 5µs (or vice versa).
    const samples = [...spread(60, 0.30, 0.34), ...spread(40, 0.62, 0.70)]
    expect(inspectCell(cell('clear rows', 'X', samples), 0.005).status).not.toBe('skipped')
    expect(inspectCell(cell('clear rows', 'X', samples), 0.1).status).toBe('skipped')
  })
})

describe('bimodality guard — aggregate reporting', () => {
  it('an audit that measured NOTHING is not a pass', () => {
    const report = auditCells([cell('select row', 'Pyreon', [0, 0, 0.005])], QUANTUM)
    expect(report.emptyAudit).toBe(true)
    expect(formatGuardReport(report, QUANTUM).join('\n')).toContain('NOTHING MEASURED')
  })

  it('names every failing op and framework in the rendered report', () => {
    const report = auditCells(
      [
        cell('append', 'Pyreon', [...spread(32, 16.4, 19.7), ...spread(68, 41.2, 53.0)]),
        cell('create 1,000', 'Pyreon', spread(100, 8.0, 8.9)),
      ],
      QUANTUM,
    )
    expect(report.failures).toHaveLength(1)
    const text = formatGuardReport(report, QUANTUM).join('\n')
    expect(text).toContain('append')
    expect(text).toContain('Pyreon')
    expect(text).toContain('MEDIAN CAPTURED BY AN ARTIFACT MODE')
    expect(report.emptyAudit).toBe(false)
  })

  it('reports a clean suite as passing', () => {
    const report = auditCells(
      [
        cell('create 1,000', 'Pyreon', spread(100, 8.0, 8.9)),
        cell('create 10,000', 'Octane', spread(100, 88.0, 92.0)),
      ],
      QUANTUM,
    )
    expect(report.failures).toHaveLength(0)
    expect(report.emptyAudit).toBe(false)
    expect(formatGuardReport(report, QUANTUM).join('\n')).toContain('no median captured')
  })
})
