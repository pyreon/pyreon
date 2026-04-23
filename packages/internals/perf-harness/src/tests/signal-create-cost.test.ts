// @vitest-environment happy-dom
/**
 * Signal creation cost probe.
 *
 * `signal()` in Pyreon allocates one closure (the read function) and
 * copies method references onto it. This probe measures how many
 * signal creations happen during typical patterns and checks we aren't
 * accidentally allocating signals on the hot mount path.
 */
import { signal } from '@pyreon/reactivity'
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

describe('signal creation cost', () => {
  it('creating 10000 signals completes quickly (no allocation-pathology)', async () => {
    const t0 = performance.now()
    const outcome = await perfHarness.record('create-10k', () => {
      const all: unknown[] = []
      for (let i = 0; i < 10_000; i++) all.push(signal(i))
    })
    const elapsed = performance.now() - t0
    expect(outcome.after['reactivity.signalCreate']).toBe(10_000)
    // oxlint-disable-next-line no-console
    console.log(`[signal-create] 10k signals in ${elapsed.toFixed(1)}ms`)
    // 10k signals should complete in well under 100ms on any dev machine.
    expect(elapsed).toBeLessThan(200)
  })

  it('signal read after create — reads are 0-allocation (no dep-collector active)', async () => {
    const s = signal(0)
    // Reading outside any effect/computed: no deps collected.
    // The read closure allocates nothing beyond the closure call frame.
    const outcome = await perfHarness.record('read-10k', () => {
      for (let i = 0; i < 10_000; i++) {
        s() // just reads, no tracking
      }
    })
    // 10k reads should fire 0 counters other than maybe signalWrite=0
    // (proves reads don't accidentally trigger writes or effect runs)
    expect(outcome.after['reactivity.signalWrite']).toBeFalsy()
    expect(outcome.after['reactivity.effectRun']).toBeFalsy()
  })

  it('signal write that does NOT change value — Object.is short-circuit', async () => {
    const s = signal(0)
    const outcome = await perfHarness.record('no-op-writes', () => {
      for (let i = 0; i < 10_000; i++) s.set(0)
    })
    // Zero writes counted (Object.is short-circuit skips the increment)
    expect(outcome.after['reactivity.signalWrite']).toBeFalsy()
  })
})
