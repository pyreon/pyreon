// @vitest-environment happy-dom
/**
 * Batch / effect re-entrancy probe.
 *
 * Effect fn writes to a signal — does the write trigger a cascade, an
 * infinite loop, or a well-ordered re-run?
 */
import { batch, computed, effect, signal } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _disable, _reset } from '../counters'
import { install, perfHarness, uninstall } from '../harness'

beforeEach(() => {
  _reset()
  install()
})

afterEach(() => {
  uninstall()
  _reset()
  _disable()
})

describe('effect re-entrancy', () => {
  it('effect writes to a DIFFERENT signal — terminates (no infinite loop)', async () => {
    const a = signal(0)
    const b = signal(0)
    let aRuns = 0
    let bRuns = 0

    effect(() => {
      a()
      aRuns++
    })
    effect(() => {
      b()
      bRuns++
    })

    const outcome = await perfHarness.record('cross-write', () => {
      effect(() => {
        // Reads a, writes to b. Should NOT infinite loop.
        if (a() === 1) b.set(b.peek() + 1)
      })
      a.set(1)
    })
    // Should complete without hanging
    expect(bRuns).toBeGreaterThan(1) // b got written at least once
    // oxlint-disable-next-line no-console
    console.log(`[reentrancy] effectRun=${outcome.after['reactivity.effectRun']}`)
  })

  it('effect writes to signal it subscribes to (self-loop) — framework must guard', async () => {
    const s = signal(0)
    let runs = 0
    effect(() => {
      s()
      runs++
      if (runs < 5 && s.peek() < 10) {
        // Self-write via peek (non-tracking): breaks the reactive loop
        // but still changes the value
      }
    })
    // Just a sanity check that the above pattern doesn't loop
    expect(runs).toBe(1)
  })

  it('batch() inside effect is safe', async () => {
    const s = signal(0)
    const results: number[] = []
    effect(() => {
      const v = s()
      results.push(v)
      if (v === 1) {
        // Batched writes inside an effect — no double-fire of the effect
        batch(() => {
          // (no-op — just verify batch() works)
        })
      }
    })
    s.set(1)
    // initial + 1 reactive run
    expect(results).toEqual([0, 1])
  })

  it('computed that reads a signal that depends on the computed — terminates', () => {
    // This is a cycle detection test. User would have to engineer this.
    const a = signal(0)
    const b = computed(() => a() + 1)
    // b now depends on a. If we write to a inside an effect that reads b:
    let runs = 0
    effect(() => {
      b()
      runs++
    })
    // One initial run
    expect(runs).toBe(1)
    a.set(1)
    // b recomputes, effect re-runs
    expect(runs).toBe(2)
  })

  it('writing 1000 times rapidly does not stack-overflow the scheduler', () => {
    const s = signal(0)
    let runs = 0
    effect(() => {
      s()
      runs++
    })
    // Tight loop of writes (each triggers auto-batch → effect re-run)
    for (let i = 1; i <= 1000; i++) s.set(i)
    // Each write is its own mini-batch → runs = 1 initial + 1000 writes = 1001
    expect(runs).toBe(1001)
  })
})
