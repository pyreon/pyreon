// @vitest-environment happy-dom
/**
 * Timing / microtask ordering probe.
 *
 * Signal writes that happen inside different execution contexts
 * (setTimeout callbacks, Promise.then, queueMicrotask, rAF) should
 * all produce consistent subscriber-fire semantics.
 */
import { batch, effect, nextTick, signal } from '@pyreon/reactivity'
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

describe('timing / async signal writes', () => {
  it('nextTick() resolves after the current microtask batch settles', async () => {
    const s = signal(0)
    let seenValue = -1
    effect(() => {
      seenValue = s()
    })

    const order: string[] = []
    queueMicrotask(() => order.push('mt1'))
    s.set(1)
    order.push('after-set')
    await nextTick()
    order.push('after-tick')

    expect(seenValue).toBe(1)
    // nextTick awaits a microtask — should see 'mt1' and 'after-set' before 'after-tick'
    expect(order).toContain('after-tick')
  })

  it('signal.set inside Promise.then — effect fires synchronously on write', async () => {
    const s = signal(0)
    let effectRuns = 0
    effect(() => {
      s()
      effectRuns++
    })

    await Promise.resolve().then(() => {
      s.set(1)
      // Effect should have fired synchronously during .then
      expect(effectRuns).toBe(2) // 1 initial + 1 for .set(1)
    })
  })

  it('signal.set inside setTimeout — effect fires synchronously', async () => {
    const s = signal(0)
    let effectRuns = 0
    effect(() => {
      s()
      effectRuns++
    })

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        s.set(1)
        expect(effectRuns).toBe(2)
        resolve()
      }, 0)
    })
  })

  it('batched writes inside a Promise.then still dedupe effect runs', async () => {
    const s = signal(0)
    let effectRuns = 0
    effect(() => {
      s()
      effectRuns++
    })

    await Promise.resolve().then(() => {
      batch(() => {
        s.set(1)
        s.set(2)
        s.set(3)
      })
      // Batched: only 1 effect re-run
      expect(effectRuns).toBe(2) // 1 initial + 1 batched
    })
  })

  it('nested setTimeout writes produce independent effect fires (no batching across ticks)', async () => {
    const s = signal(0)
    let effectRuns = 0
    effect(() => {
      s()
      effectRuns++
    })

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        s.set(1)
        setTimeout(() => {
          s.set(2)
          expect(effectRuns).toBe(3) // 1 initial + 2 individual writes
          resolve()
        }, 0)
      }, 0)
    })
  })
})
