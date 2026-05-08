/**
 * Reproduction of the deferred bug from PR #490 (queryReactiveKey-1000 journey).
 *
 * Symptom from real-app stress: a `reactKey` signal subscribed to by ~100
 * effects (each useQuery's setOptions effect) sees `signalWrite` increment
 * on every `.set(i)` in a tight external loop, but only 1 of N effect runs
 * propagates per .set — `effectRun` stays at the initial-mount count.
 *
 * Hypothesis to test: `notifySubscribers` in tracking.ts iterates the live
 * Set with `originalSize` cap. If an effect's body calls cleanupEffect (which
 * removes itself from the Set) AND re-subscribes (adds itself back at the
 * end), the iteration order shifts so subsequent effects' positions move
 * BEFORE `i`, causing them to be skipped on this pass.
 *
 * See packages/core/reactivity/src/tracking.ts:77-105 (notifySubscribers).
 */
import { describe, expect, it } from 'vitest'
import { effect, effectScope, signal } from '../index'

describe('signal fan-out under tight external write loop', () => {
  it('100 effects subscribing to same signal — each fires on every external .set', () => {
    const sig = signal(0)
    const counts = new Array(100).fill(0)

    for (let i = 0; i < 100; i++) {
      const idx = i
      effect(() => {
        sig() // subscribe
        counts[idx]++
      })
    }

    // Each effect ran ONCE at registration.
    for (const c of counts) expect(c).toBe(1)

    // 10 external writes from outside any batch.
    for (let i = 1; i <= 10; i++) sig.set(i)

    // Each effect should have re-fired 10 times → total = 11.
    for (let i = 0; i < counts.length; i++) {
      expect(counts[i], `effect[${i}] runs after 10 sets`).toBe(11)
    }
  })

  it('1 effect — fires on every external .set (control)', () => {
    const sig = signal(0)
    let count = 0

    effect(() => {
      sig()
      count++
    })

    expect(count).toBe(1)
    for (let i = 1; i <= 10; i++) sig.set(i)
    expect(count).toBe(11)
  })

  it('5 effects + 5 external sets — each effect fires per set', () => {
    const sig = signal(0)
    const counts = new Array(5).fill(0)

    for (let i = 0; i < 5; i++) {
      const idx = i
      effect(() => {
        sig()
        counts[idx]++
      })
    }

    for (let i = 1; i <= 5; i++) sig.set(i)

    // Each effect: 1 initial + 5 re-runs = 6.
    for (let i = 0; i < counts.length; i++) {
      expect(counts[i], `effect[${i}]`).toBe(6)
    }
  })

  it('100 effects inside an EffectScope — each fires on every external .set', () => {
    const sig = signal(0)
    const counts = new Array(100).fill(0)
    const scope = effectScope()

    scope.runInScope(() => {
      for (let i = 0; i < 100; i++) {
        const idx = i
        effect(() => {
          sig()
          counts[idx]++
        })
      }
    })

    for (const c of counts) expect(c).toBe(1)

    for (let i = 1; i <= 10; i++) sig.set(i)

    for (let i = 0; i < counts.length; i++) {
      expect(counts[i], `effect[${i}] runs after 10 sets`).toBe(11)
    }
  })

  it('1000 effects subscribing to same signal — each fires per .set', () => {
    const sig = signal(0)
    const counts = new Array(1000).fill(0)
    for (let i = 0; i < 1000; i++) {
      const idx = i
      effect(() => {
        sig()
        counts[idx]++
      })
    }
    for (let i = 1; i <= 10; i++) sig.set(i)
    let failed = 0
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] !== 11) failed++
    }
    expect(failed, `effects with wrong count`).toBe(0)
  })

  it('effects created INSIDE another effect run (inner-effect collector path)', () => {
    const trigger = signal(0)
    const sig = signal(0)
    const counts = new Array(50).fill(0)
    let outerRuns = 0

    // Outer effect creates 50 INNER effects on each run.
    effect(() => {
      trigger()
      outerRuns++
      for (let i = 0; i < 50; i++) {
        const idx = i
        effect(() => {
          sig()
          counts[idx]++
        })
      }
    })

    // Reset counts after initial outer run created the inners with their initial run.
    expect(outerRuns).toBe(1)
    for (const c of counts) expect(c).toBe(1)

    // Now flip sig 10 times — every inner should fire 10 more times.
    for (let i = 1; i <= 10; i++) sig.set(i)

    let failed = 0
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] !== 11) failed++
    }
    expect(failed, `inner effects with wrong count`).toBe(0)
  })

  it('100 effects whose body writes to an unrelated signal during run', () => {
    // Mirrors useQuery's effect: body calls observer.setOptions(options())
    // which fires the observer's subscribe callback, which calls batch()
    // and writes to N "result slot" signals (which may have 0 or N subscribers).
    const sig = signal(0)
    const slot = signal('')
    const counts = new Array(100).fill(0)

    for (let i = 0; i < 100; i++) {
      const idx = i
      effect(() => {
        sig() // subscribe to sig
        // Simulate observer.setOptions's downstream subscribe-callback work:
        // an inner write to a different signal that has no subscribers.
        slot.set(`run-${idx}`) // 100 different values, each Object.is fails
        counts[idx]++
      })
    }

    for (let i = 1; i <= 10; i++) sig.set(i)

    for (let i = 0; i < counts.length; i++) {
      expect(counts[i], `effect[${i}] runs after 10 sets`).toBe(11)
    }
  })
})
