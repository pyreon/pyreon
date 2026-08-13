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

  it('stops growing a run whose cost is FLAT in n, instead of doubling into an OOM', () => {
    // The shape that killed `@pyreon/router`'s suite on main: the caller asserts
    // "cost does not grow with n", so growing n can never reach minMs — and the
    // caller's run() retained an O(n) fixture per size, so 24 doublings became a
    // 4GB heap death that took 95 results down silently.
    //
    // This run is deliberately ALLOCATION-FREE, so that with the flat-stop
    // reverted this spec fails on the assertions below rather than exhausting
    // the heap — a regression test must fail loudly, not crash the worker.
    let sink = 0
    const flatInN = (_n: number): void => {
      for (let i = 0; i < 300_000; i++) sink += i
    }

    const r = measureComplexity(flatInN, 8, { minMs: 1_000, samples: 1 })

    expect(sink).toBeGreaterThan(0)
    expect(r.ok).toBe(false)
    // The verdict must NAME the cause and the fix, or the next author repeats it.
    expect(r.detail).toContain('FLAT in n')
    expect(r.detail).toContain('more iterations inside run()')
    // …and it must have stopped EARLY: the full budget is 24 doublings, which
    // from 8 reaches 134 million.
    expect(r.baseN).toBeLessThan(8 * 2 ** 10)
  })

  it('bounds a run that RETAINS a fixture per size — the shape that killed the worker', () => {
    // The router's `treeFor(n)` cached every tree it built, so each doubling
    // added an O(n) fixture that was never released. Reproduced in miniature:
    // what must hold is that growth STOPS while a verdict is still possible,
    // rather than running the full budget (from 4096 that reaches 68 billion).
    // The retained fixture is CAPPED, unlike the router's. That is deliberate:
    // an uncapped one reproduces the original failure exactly — with the stop
    // reverted this spec exhausted the heap and took three sibling results down
    // with it, which is the reporting failure this whole change is about. A
    // regression test must fail on an assertion, not by killing the worker. The
    // cap keeps the SHAPE (a fixture retained per size, never released) while
    // bounding the damage, and `baseN` is what actually carries the verdict.
    const kept: number[][] = []
    const retains = (n: number): void => {
      const size = Math.min(n, 50_000)
      const fixture = new Array<number>(size)
      for (let i = 0; i < size; i++) fixture[i] = i
      kept.push(fixture) // never released — this is the shape under test
    }

    // minMs deliberately unreachable, so only a stop condition can end the loop.
    const r = measureComplexity(retains, 4096, { minMs: 60_000, samples: 1 })

    expect(r.ok).toBe(false)
    expect(r.detail).toContain('UNMEASURABLE')
    // Without the stop, growth runs the full budget: 4096 * 2**24 = 68 billion.
    expect(r.baseN).toBeLessThan(4096 * 2 ** 10)
    expect(kept.length).toBeGreaterThan(0)
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
