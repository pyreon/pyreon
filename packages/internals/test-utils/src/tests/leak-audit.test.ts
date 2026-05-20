/**
 * Tests for the leak-audit harness math (`scripts/leak-audit.ts`).
 *
 * The harness itself spawns a real browser via Playwright (gated by
 * `import.meta.main`); these tests import the pure `linearRegression`
 * export and validate the math against deliberately-shaped datasets.
 * This is the "the harness CAN detect a leak" gate — without it, the
 * harness reporting "no leak" on a real run is unfalsifiable.
 *
 * "No subprocess-tested scripts" rule: matches `audit-leak-classes`
 * test pattern — pure-function exports, no CLI driver triggered.
 */
import { linearRegression } from '../../../../../scripts/leak-audit'

describe('linearRegression', () => {
  it('returns zero slope on empty or single-sample input', () => {
    expect(linearRegression([])).toEqual({ slope: 0, intercept: 0, rSquared: 0 })
    expect(linearRegression([42])).toEqual({ slope: 0, intercept: 42, rSquared: 0 })
  })

  it('detects a perfectly linear increasing trend (slope > 0)', () => {
    // Pure linear: y = 10x + 100
    const samples = [100, 110, 120, 130, 140, 150, 160, 170, 180, 190]
    const { slope, intercept, rSquared } = linearRegression(samples)
    expect(slope).toBeCloseTo(10, 5)
    expect(intercept).toBeCloseTo(100, 5)
    expect(rSquared).toBeCloseTo(1, 5) // perfect fit
  })

  it('detects a perfectly linear decreasing trend (slope < 0)', () => {
    const samples = [200, 190, 180, 170, 160, 150, 140, 130, 120, 110]
    const { slope, intercept, rSquared } = linearRegression(samples)
    expect(slope).toBeCloseTo(-10, 5)
    expect(intercept).toBeCloseTo(200, 5)
    expect(rSquared).toBeCloseTo(1, 5)
  })

  it('returns slope=0, rSquared=0 on constant input (no variance to explain)', () => {
    // All identical — the canonical "no leak" outcome from a real run.
    // R² is undefined when total variance is 0; we return 0 by convention.
    const samples = [9_540_000, 9_540_000, 9_540_000, 9_540_000, 9_540_000]
    const { slope, rSquared } = linearRegression(samples)
    expect(slope).toBe(0)
    expect(rSquared).toBe(0)
  })

  it('detects a small leak (50 KB/cycle slope is statistically significant on 50 cycles)', () => {
    // 50 KB/cycle × 50 cycles = 2.5 MB total growth. Realistic leak shape.
    const baseline = 10_000_000 // 10 MB
    const samples = Array.from({ length: 50 }, (_, i) => baseline + 50_000 * i)
    const { slope, rSquared } = linearRegression(samples)
    expect(slope).toBeCloseTo(50_000, 0)
    expect(rSquared).toBeCloseTo(1, 5)
  })

  it('estimates slope correctly in the presence of noise', () => {
    // Real heap samples are noisy (allocator fragmentation, JIT warmup,
    // background GC). Simulate: true slope = 30 KB/cycle, ±50 KB noise.
    const baseline = 10_000_000
    // Use a deterministic pseudo-noise via a seeded LCG so the test
    // is reproducible.
    let seed = 12345
    const noise = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return (seed / 0x7fffffff - 0.5) * 100_000 // ±50 KB
    }
    const samples = Array.from({ length: 100 }, (_, i) => baseline + 30_000 * i + noise())
    const { slope, rSquared } = linearRegression(samples)
    // Noise is symmetric and bounded; slope estimate should land near
    // 30_000 but with looser tolerance.
    expect(slope).toBeGreaterThan(25_000)
    expect(slope).toBeLessThan(35_000)
    // rSquared should be high but not perfect (noise lowers fit quality)
    expect(rSquared).toBeGreaterThan(0.8)
    expect(rSquared).toBeLessThan(1)
  })

  it('low rSquared signals when slope estimate is unreliable (pure noise, no trend)', () => {
    // No trend at all — heap just bouncing around a mean. Slope should
    // be small AND rSquared should be near zero (the line explains
    // little of the variance).
    const baseline = 10_000_000
    let seed = 67890
    const noise = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return (seed / 0x7fffffff - 0.5) * 500_000 // ±250 KB
    }
    const samples = Array.from({ length: 100 }, () => baseline + noise())
    const { slope, rSquared } = linearRegression(samples)
    expect(Math.abs(slope)).toBeLessThan(10_000) // near zero
    expect(rSquared).toBeLessThan(0.3) // noisy — low fit quality
  })

  it('intercept matches the mean when slope is zero', () => {
    const samples = [100, 100, 100, 100, 100]
    const { slope, intercept } = linearRegression(samples)
    expect(slope).toBe(0)
    expect(intercept).toBe(100)
  })

  it('handles the heap-snapshot bug-replication shape: 100k entries/cycle would slope ~7MB/cycle', () => {
    // What the harness WOULD see if it ran against the pre-fix 0.21.x
    // codebase: each cycle's reactive remount adds ~5MB of retained
    // context frames. Linear regression should detect the slope
    // unambiguously.
    const baseline = 50_000_000
    const samples = Array.from({ length: 50 }, (_, i) => baseline + 5_000_000 * i)
    const { slope, rSquared } = linearRegression(samples)
    expect(slope).toBeCloseTo(5_000_000, 0) // 5 MB/cycle
    expect(rSquared).toBeCloseTo(1, 5)
    // This is the magnitude that would fail any reasonable threshold —
    // proves the harness CAN catch the original bug class.
  })
})
