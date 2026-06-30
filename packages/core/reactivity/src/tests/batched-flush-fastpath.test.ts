/**
 * Parity locks for the EXPLICIT-batch drain fast path (`drainQueuesLocked`'s
 * single-pass shortcut for the effects-only / no-cascade common case + the
 * reused `_visitedScratch` Set).
 *
 * The fast path runs ONE effect pass and returns if it produced no follow-up
 * work; a cascade falls through to the general multi-pass loop as pass 2+. These
 * specs pin the OBSERVABLE semantics it must share with the general loop — they
 * catch a BUGGY fast path (dropped cascade, lost coalescing, broken self-re-fire
 * dedup), not the perf delta (which the controlled A/B in the PR measures and is
 * machine-dependent / not CI-gated).
 *
 * Each spec targets one edge the fast path reasons about:
 *   1. coalescing — a subscriber sees the batch's FINAL state, once;
 *   2. cascade fall-through — an effect that writes another signal still drives
 *      the downstream effect (the fast path detects follow-up work + continues);
 *   3. computed-recompute cascade — settles before the dependent effect;
 *   4. diamond dedup — one write reaching an effect via two deps fires it once;
 *   5. self-re-enqueue (the ErrorBoundary cross-pass pattern) re-fires + is
 *      capped (no infinite loop).
 */
import { describe, expect, it } from 'vitest'
import { batch, computed, effect, signal } from '../index'

describe('explicit-batch drain — fast-path parity', () => {
  it('coalesces a single subscriber to the batch final value (fires once)', () => {
    const s = signal(0)
    const seen: number[] = []
    const stop = s.subscribe(() => seen.push(s.peek()))
    batch(() => {
      s.set(1)
      s.set(2)
      s.set(3)
    })
    expect(seen).toEqual([3]) // one notification, final value
    stop()
  })

  it('cascade fall-through: an effect that writes another signal drives its effect', () => {
    const a = signal(0)
    const b = signal(0)
    const log: string[] = []
    // effect on `a` cascades into a write of `b`; `b`'s effect must run.
    const stopA = effect(() => {
      log.push(`a=${a()}`)
      if (a() > 0) b.set(a() * 10)
    })
    const stopB = effect(() => {
      log.push(`b=${b()}`)
    })
    log.length = 0
    batch(() => {
      a.set(5)
    })
    expect(b()).toBe(50) // cascade applied
    expect(log).toContain('a=5')
    expect(log).toContain('b=50') // downstream effect ran (fall-through worked)
    stopA.dispose()
    stopB.dispose()
  })

  it('computed-recompute cascade settles before the dependent effect', () => {
    const n = signal(1)
    const doubled = computed(() => n() * 2)
    const seen: number[] = []
    const stop = effect(() => {
      seen.push(doubled())
    })
    seen.length = 0
    batch(() => {
      n.set(10)
    })
    expect(seen).toEqual([20]) // effect saw the recomputed value, once
    stop.dispose()
  })

  it('diamond: one write reaching an effect via two deps fires it once', () => {
    const src = signal(0)
    const left = computed(() => src() + 1)
    const right = computed(() => src() + 2)
    let runs = 0
    const stop = effect(() => {
      left()
      right()
      runs++
    })
    runs = 0
    batch(() => {
      src.set(5)
    })
    expect(runs).toBe(1) // diamond dedup — single fire despite two paths
    stop.dispose()
  })

  it('self-re-enqueue re-fires across passes and is capped (no infinite loop)', () => {
    const s = signal(0)
    let runs = 0
    // Effect writes a signal it also reads, with a guard so it converges.
    const stop = effect(() => {
      runs++
      if (s() < 3) s.set(s() + 1)
    })
    runs = 0
    batch(() => {
      s.set(1)
    })
    // Converges (1 → 2 → 3), runs a bounded number of times, no hang.
    expect(s()).toBe(3)
    expect(runs).toBeGreaterThanOrEqual(1)
    expect(runs).toBeLessThan(32) // well under MAX_PASSES
    stop.dispose()
  })

  it('multiple independent subscribers each fire once per batch', () => {
    const a = signal(0)
    const b = signal(0)
    const seen: string[] = []
    const sa = a.subscribe(() => seen.push('a'))
    const sb = b.subscribe(() => seen.push('b'))
    batch(() => {
      a.set(1)
      b.set(1)
    })
    expect(seen.sort()).toEqual(['a', 'b']) // each once
    sa()
    sb()
  })
})
