import { describe, expect, it } from 'vitest'
import { clusterBootstrapCI95 } from '../../../../../examples/benchmark/cluster-bootstrap'
import { cvOf, summarizeMicroCell } from '../../../../../scripts/bench/core/micro-stats'

/**
 * `scripts/bench/core/reactivity.ts` measures each cell in several processes ×
 * 10 windows. It used to pool the windows and bootstrap them as independent
 * draws, so its CI95 ignored the process-to-process spread and 1–3% gaps were
 * called wins. The micro harness now uses the shared cluster bootstrap.
 */

/** `n` windows evenly spread over [centre − half, centre + half] (ns/op). */
function proc(centre: number, half: number, n = 10): number[] {
  const step = (2 * half) / (n - 1)
  return Array.from({ length: n }, (_, i) => centre - half + i * step)
}

const overlaps = (a: readonly [number, number], b: readonly [number, number]) =>
  a[0] <= b[1] && b[0] <= a[1]

// Two arms with the same between-process spread (±3% around ~100 ns), tight
// windows within each process, and a 2% gap between arm medians — the shape the
// 2026-11-25 rc2 run reported as "WIN (small)".
const ARM_A = [97, 100, 103, 99, 101, 104].map((c) => proc(c, 0.2))
const ARM_B = [99, 102, 105, 101, 103, 106].map((c) => proc(c, 0.2))

describe('summarizeMicroCell', () => {
  it('the naive pooled CI calls a winner that the process-clustered CI does not', () => {
    const naiveA = clusterBootstrapCI95([ARM_A.flat()], { resamples: 2000, seed: 0x5eed })
    const naiveB = clusterBootstrapCI95([ARM_B.flat()], { resamples: 2000, seed: 0x5eed })
    expect(overlaps(naiveA, naiveB)).toBe(false)

    const a = summarizeMicroCell(ARM_A)
    const b = summarizeMicroCell(ARM_B)
    expect(overlaps([a.lo, a.hi], [b.lo, b.hi])).toBe(true)
  })

  it('still separates arms whose gap exceeds the between-process spread', () => {
    const far = ARM_A.map((p) => p.map((x) => x * 1.15))
    const a = summarizeMicroCell(ARM_A)
    const b = summarizeMicroCell(far)
    expect(b.lo).toBeGreaterThan(a.hi)
  })

  it('keeps every process’s raw windows and reports the dispersion split', () => {
    const s = summarizeMicroCell(ARM_A)
    expect(s.processes).toEqual(ARM_A)
    expect(s.processCount).toBe(6)
    expect(s.n).toBe(60)
    expect(s.betweenProcessCv).toBeGreaterThan(10 * s.withinProcessCv)
    expect(s.med).toBeCloseTo(100.5, 1)
  })

  it('ignores empty processes and is deterministic per seed', () => {
    expect(summarizeMicroCell([[], ...ARM_A])).toEqual(summarizeMicroCell(ARM_A))
  })

  it('cvOf handles degenerate input', () => {
    expect(cvOf([])).toBe(0)
    expect(cvOf([5])).toBe(0)
    expect(cvOf([0, 0])).toBe(0)
    expect(cvOf([1, 3])).toBeCloseTo(Math.SQRT2 / 2, 10)
  })
})
