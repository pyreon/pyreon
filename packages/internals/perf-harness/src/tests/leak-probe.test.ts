// @vitest-environment happy-dom
/**
 * Mount/unmount leak probe.
 *
 * Mounts a reactive subtree, disposes it, mounts again, disposes again,
 * and asserts that EACH cycle produces the same counter signature.
 * If anything (effects, subscribers, DOM nodes, signal slots) leaks
 * across unmount, the second cycle's counts grow — which this probe
 * flags.
 *
 * The counters this catches:
 *   - `runtime.mount` / `runtime.unmount` imbalance
 *   - `reactivity.effectRun` growth proportional to N writes ×
 *     (mount-count), not just N writes (means unmounted effects are
 *     still subscribed to signals)
 *   - `reactivity.signalCreate` growth — signals leaking into lifetime
 *
 * Complements the framework's own teardown tests (runtime-dom has
 * dispose tests) by checking the observable emission pattern across
 * multiple mount/unmount cycles.
 */
import { For, h } from '@pyreon/core'
import { effect, signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _disable, _reset } from '../counters'
import { install, perfHarness, uninstall } from '../harness'
import { resetDom } from './_dom-setup'

beforeEach(() => {
  _reset()
  install()
  resetDom()
})

afterEach(() => {
  uninstall()
  _reset()
  _disable()
  document.body.innerHTML = ''
})

describe('mount/unmount leak probe', () => {
  it('mount + unmount pairs balance — no leaked unmounts after 5 cycles', async () => {
    const root = document.getElementById('root')!
    for (let i = 0; i < 5; i++) {
      const dispose = mount(h('div', null, 'hello'), root)
      dispose()
    }
    const snap = perfHarness.snapshot()
    expect(snap['runtime.mount']).toBe(5)
    expect(snap['runtime.unmount']).toBe(5)
  })

  it('effect subscribed to a signal is released on dispose (no re-run after)', async () => {
    const s = signal(0)
    const e = effect(() => {
      s()
    })

    // Baseline: 1 initial run + 3 re-runs = 4
    s.set(1)
    s.set(2)
    s.set(3)
    expect(perfHarness.snapshot()['reactivity.effectRun']).toBe(4)

    e.dispose()
    // After dispose, writes should NOT trigger effectRun.
    s.set(4)
    s.set(5)
    expect(perfHarness.snapshot()['reactivity.effectRun']).toBe(4) // unchanged
  })

  it('mount of <For> + dispose + mount again — second cycle has same counter shape', async () => {
    const root = document.getElementById('root')!

    const runOnce = (): Record<string, number> => {
      perfHarness.reset()
      const items = signal([1, 2, 3, 4, 5, 6, 7, 8])
      const dispose = mount(
        h(For, {
          each: () => items(),
          by: (n: number) => n,
          children: (n: number) => h('li', null, String(n)),
        }),
        root,
      )
      // Do one reactive update to make sure the For's effect is wired.
      items.set([8, 7, 6, 5, 4, 3, 2, 1])
      dispose()
      return perfHarness.snapshot()
    }

    const first = runOnce()
    const second = runOnce()

    // Shapes should match exactly — no leak means same counter keys and values.
    expect(Object.keys(second).sort()).toEqual(Object.keys(first).sort())
    for (const key of Object.keys(first)) {
      expect(
        second[key],
        `counter ${key} leaked across mount/unmount cycles: ${first[key]} → ${second[key]}`,
      ).toBe(first[key])
    }
  })

  it('disposed effect does not re-fire even when its previously-tracked signal writes', async () => {
    const s = signal(0)

    const before = perfHarness.snapshot()['reactivity.effectRun'] ?? 0

    // Mount, dispose, then write to the signal the disposed effect had been
    // subscribed to. effectRun should be exactly +1 (the initial run), not +2.
    const e = effect(() => {
      s()
    })
    e.dispose()
    s.set(999)

    const after = perfHarness.snapshot()['reactivity.effectRun'] ?? 0
    expect(after - before).toBe(1)
  })
})
