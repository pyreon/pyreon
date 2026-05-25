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
    // 10k signals — RUNTIME-ONLY worst case (this test does NOT load
    // `@pyreon/vite-plugin` so every signal hits the runtime fallback
    // path of `_captureCallerLocation`). Post-deferred-parse refactor,
    // the runtime fallback only pays a cheap `new Error()` allocation
    // (~0.14µs); the expensive `.stack` formatting is lazily resolved
    // at devtools-read time. Measured baseline: ~40ms for 10k signals.
    // 200ms threshold gives 5× headroom for CI parallel-load variance.
    // Going above 200ms suggests an allocation-pathology regression
    // (e.g. `.stack` reverted to eager, FinalizationRegistry GC
    // pressure, or NodeRec grew).
    expect(elapsed).toBeLessThan(200)
  })

  it('creating 10000 signals with __sourceLocation (vite-injected path) stays cheap', async () => {
    // Production path: `@pyreon/vite-plugin` rewrites `signal(0)` →
    // `signal(0, { __sourceLocation })` at build time so the runtime
    // `_captureCallerLocation` is never called. This proves the always-on
    // capture has ZERO impact on real vite-built apps regardless of
    // signal count. Steady-state: ~8ms for 10k.
    const injected = { file: '/fake/build/path.ts', line: 1, col: 1 }
    const t0 = performance.now()
    const outcome = await perfHarness.record('create-10k-injected', () => {
      const all: unknown[] = []
      for (let i = 0; i < 10_000; i++)
        all.push(signal(i, { __sourceLocation: injected }))
    })
    const elapsed = performance.now() - t0
    expect(outcome.after['reactivity.signalCreate']).toBe(10_000)
    // oxlint-disable-next-line no-console
    console.log(`[signal-create] 10k vite-injected signals in ${elapsed.toFixed(1)}ms`)
    expect(elapsed).toBeLessThan(100)
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
