// @vitest-environment happy-dom
/**
 * Many-subscribers probe. How does the framework behave when a single
 * signal has hundreds / thousands of subscribers? This is the shape of
 * a global theme signal, route state, or user session — things that
 * fan out to many components.
 */
import { effect, signal } from '@pyreon/reactivity'
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

describe('many subscribers on one signal', () => {
  it('N=100 subscribers — one write fires each exactly once', async () => {
    const s = signal(0)
    const effects: Array<{ dispose: () => void }> = []
    for (let i = 0; i < 100; i++) {
      effects.push(
        effect(() => {
          s()
        }),
      )
    }
    const outcome = await perfHarness.record('100-subs-one-write', () => {
      s.set(1)
    })
    // Each of 100 effects re-runs exactly once = 100 effect runs
    expect(outcome.after['reactivity.effectRun']).toBe(100)
    for (const e of effects) e.dispose()
  })

  it('N=1000 subscribers — one write fires each exactly once', async () => {
    const s = signal(0)
    const effects: Array<{ dispose: () => void }> = []
    for (let i = 0; i < 1000; i++) {
      effects.push(
        effect(() => {
          s()
        }),
      )
    }
    const outcome = await perfHarness.record('1000-subs', () => {
      s.set(1)
    })
    expect(outcome.after['reactivity.effectRun']).toBe(1000)
    for (const e of effects) e.dispose()
  })

  it('dispose half the subscribers — next write fires only the remaining half', async () => {
    const s = signal(0)
    const effects: Array<{ dispose: () => void }> = []
    for (let i = 0; i < 100; i++) {
      effects.push(
        effect(() => {
          s()
        }),
      )
    }
    // Dispose the first half
    for (let i = 0; i < 50; i++) effects[i]!.dispose()

    const outcome = await perfHarness.record('half-disposed', () => {
      s.set(1)
    })
    expect(outcome.after['reactivity.effectRun']).toBe(50)
    for (let i = 50; i < 100; i++) effects[i]!.dispose()
  })

  it('subscribe / unsubscribe cycling does not leak internal storage', () => {
    const s = signal(0)
    // Sub and unsub 1000 times. After all disposes, the subscriber set
    // should be empty (no leaked references).
    for (let cycle = 0; cycle < 1000; cycle++) {
      const e = effect(() => {
        s()
      })
      e.dispose()
    }
    // No effects alive — subscriber count on the signal should be 0.
    const info = s.debug()
    expect(info.subscriberCount).toBe(0)
  })

  it('large write burst under batch — each effect fires exactly once', async () => {
    const s = signal(0)
    const N_SUBS = 500
    const effects: Array<{ dispose: () => void }> = []
    for (let i = 0; i < N_SUBS; i++) {
      effects.push(
        effect(() => {
          s()
        }),
      )
    }
    const { batch } = await import('@pyreon/reactivity')
    const outcome = await perfHarness.record('burst-batch', () => {
      batch(() => {
        for (let i = 1; i <= 100; i++) s.set(i)
      })
    })
    // 100 writes batched → 1 notification per subscriber = 500 total effect runs
    expect(outcome.after['reactivity.effectRun']).toBe(N_SUBS)
    for (const e of effects) e.dispose()
  })
})
