// @vitest-environment happy-dom
/**
 * `batch()` effectiveness probe.
 *
 * Contract: `batch(fn)` should collapse N signal writes inside fn into
 * at most ONE notification to each subscribed effect, even if the effect
 * depends on multiple signals that were all written.
 *
 * If batching breaks, the effect re-runs once per write — which this
 * probe flags as a reactivity.effectRun count that scales with the
 * number of batched writes instead of being constant.
 */
import { batch, effect, signal } from '@pyreon/reactivity'
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

describe('batch() effectiveness', () => {
  it('N writes to ONE signal inside batch() → effect runs exactly 2× (initial + one batched)', async () => {
    const s = signal(0)
    const outcome = await perfHarness.record('batch-one-signal', () => {
      effect(() => {
        s()
      })
      batch(() => {
        for (let i = 1; i <= 10; i++) s.set(i)
      })
    })
    // 1 initial run + 1 post-batch notification = 2
    expect(outcome.after['reactivity.effectRun']).toBe(2)
  })

  it('writes to THREE signals an effect subscribes to → effect runs exactly 2× inside batch', async () => {
    const a = signal(0)
    const b = signal(0)
    const c = signal(0)
    const outcome = await perfHarness.record('batch-three-signals', () => {
      effect(() => {
        a()
        b()
        c()
      })
      batch(() => {
        a.set(1)
        b.set(2)
        c.set(3)
      })
    })
    // 1 initial + 1 batched notification regardless of how many signals fired
    expect(outcome.after['reactivity.effectRun']).toBe(2)
  })

  it('WITHOUT batch, same writes produce one effect run per signal-write', async () => {
    const a = signal(0)
    const b = signal(0)
    const c = signal(0)
    const outcome = await perfHarness.record('no-batch', () => {
      effect(() => {
        a()
        b()
        c()
      })
      // No batch — each write fires individually
      a.set(1)
      b.set(2)
      c.set(3)
    })
    // 1 initial + 3 writes = 4
    expect(outcome.after['reactivity.effectRun']).toBe(4)
  })

  it('nested batch() flattens to a single outer notification', async () => {
    const s = signal(0)
    const outcome = await perfHarness.record('nested-batch', () => {
      effect(() => {
        s()
      })
      batch(() => {
        s.set(1)
        batch(() => {
          s.set(2)
          s.set(3)
        })
        s.set(4)
      })
    })
    // 1 initial + 1 after outer batch = 2
    expect(outcome.after['reactivity.effectRun']).toBe(2)
  })
})
