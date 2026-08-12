import { describe, expect, it } from 'vitest'
import { expectSubQuadratic, measureComplexity } from '../complexity'

// A helper that guards complexity is only worth having if it FAILS on a
// genuinely quadratic function. These tests are the proof — they run a real
// O(n) and a real O(n²) through it and assert opposite verdicts.

/** O(n) — one pass. */
function linear(n: number): number {
  let acc = 0
  for (let i = 0; i < n; i++) acc += i
  return acc
}

/** O(n²) — nested pass. Kept cheap per-iteration so base sizes stay small. */
function quadratic(n: number): number {
  let acc = 0
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) acc += 1
  return acc
}

describe('measureComplexity', () => {
  it('reports a ratio near the scale factor for a linear function', () => {
    const r = measureComplexity((n) => void linear(n), 200_000, { scale: 8, samples: 3 })
    expect(r.baseMs).toBeGreaterThan(0)
    // Linear ⇒ ~8x. Allow a wide band: this must not itself be flaky.
    expect(r.ratio).toBeLessThan(24)
    expect(r.ok).toBe(true)
  })

  it('reports a ratio far above the scale factor for a quadratic function', () => {
    const r = measureComplexity((n) => void quadratic(n), 400, { scale: 8, samples: 2 })
    // Quadratic ⇒ ~64x. Assert well clear of the linear expectation rather
    // than near 64, so the test states the DISTINCTION, not a magic number.
    expect(r.ratio).toBeGreaterThan(24)
    expect(r.ok).toBe(false)
  })

  it('grows the base size until the run is measurable', () => {
    // A trivially fast op at n=1 would time as 0ms and make the ratio 0/0.
    const r = measureComplexity((n) => void linear(n), 1, { minMs: 1, samples: 1 })
    expect(r.baseN).toBeGreaterThan(1)
    expect(r.baseMs).toBeGreaterThanOrEqual(1)
  })

  it('marks an unmeasurable run instead of silently passing', () => {
    // minMs unreachable within the growth budget ⇒ ok=false and a stated reason.
    const r = measureComplexity(() => {}, 1, { minMs: 1_000_000 })
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('UNMEASURABLE')
  })
})

describe('expectSubQuadratic', () => {
  it('passes a linear function', () => {
    expect(() =>
      expectSubQuadratic((n) => void linear(n), 200_000, { label: 'linear', samples: 3 }),
    ).not.toThrow()
  })

  it('throws on a quadratic function, naming the observed curve', () => {
    let message = ''
    try {
      expectSubQuadratic((n) => void quadratic(n), 400, { label: 'quadratic', samples: 2 })
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain('expected sub-quadratic growth')
    expect(message).toContain('quadratic')
    expect(message).toContain('ratio')
  })
})
