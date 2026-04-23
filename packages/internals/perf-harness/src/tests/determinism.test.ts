// @vitest-environment happy-dom
/**
 * Determinism smoke test.
 *
 * Counters are deterministic by construction: every emit is synchronous and
 * uncoupled from wall-clock, timer, or GC. Running the same scenario N times
 * must produce identical counter values every time. If not, either a counter
 * is being double-fired, missed, or (worst case) the harness has state that
 * leaks across runs.
 *
 * The runs happen back-to-back in the same vitest process — this stresses the
 * isolation semantics of `perfHarness.record()` and the `_reset()` /
 * `_disable()` lifecycle the CI workflow relies on.
 */
import { For, h } from '@pyreon/core'
import { computed, effect, signal } from '@pyreon/reactivity'
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

describe('determinism', () => {
  it('same scenario → identical counter snapshots across 5 runs', async () => {
    const runOnce = async () => {
      const s = signal(0)
      const c = computed(() => s() * 2)
      const e = effect(() => {
        s()
      })
      s.set(1)
      s.set(2)
      c() // flush computed
      e.dispose()
      return perfHarness.snapshot()
    }

    const snapshots: Record<string, number>[] = []
    for (let i = 0; i < 5; i++) {
      perfHarness.reset()
      snapshots.push(await runOnce())
    }

    // Every run produced the same counts — stringify lets us compare maps
    // without worrying about insertion order.
    const normalised = snapshots.map((s) => JSON.stringify(s, Object.keys(s).sort()))
    const unique = new Set(normalised)
    expect(
      unique.size,
      `expected 1 unique snapshot across 5 runs, got ${unique.size}:\n${[...unique].join('\n')}`,
    ).toBe(1)
  })

  it('same mount + shuffle scenario → identical runtime counters across 3 runs', async () => {
    const runOnce = async () => {
      const N = 50
      const items = signal(Array.from({ length: N }, (_, i) => i))
      const root = resetDom()
      const dispose = mount(
        h(For, {
          each: () => items(),
          by: (n: number) => n,
          children: (n: number) => h('li', null, String(n)),
        }),
        root,
      )
      items.set([...items()].reverse())
      dispose()
      return perfHarness.snapshot()
    }

    const snapshots: Record<string, number>[] = []
    for (let i = 0; i < 3; i++) {
      perfHarness.reset()
      snapshots.push(await runOnce())
    }
    const normalised = snapshots.map((s) => JSON.stringify(s, Object.keys(s).sort()))
    expect(new Set(normalised).size).toBe(1)
  })

  it('harness record/reset cycle does not leak state across invocations', async () => {
    const s = signal(0)
    const outcome1 = await perfHarness.record('run-1', () => {
      s.set(1)
      s.set(2)
    })
    const outcome2 = await perfHarness.record('run-2', () => {
      s.set(3)
      s.set(4)
    })
    expect(outcome1.after['reactivity.signalWrite']).toBe(2)
    expect(outcome2.after['reactivity.signalWrite']).toBe(2)
  })
})
