// @vitest-environment happy-dom
/**
 * Per-counter behavioural tests for @pyreon/runtime-dom.
 *
 * Uses real mount() against a happy-dom DOM. The tests double as the
 * "runtime.mountFor.lisOps is wired on both LIS paths" regression guard —
 * there were TWO compute-LIS functions (keyedList and For) and only the
 * first was instrumented initially. The second test here (`shuffles trigger
 * LIS ops`) is the one that catches that regression.
 */
import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
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

describe('runtime.mount / runtime.unmount', () => {
  it('fires mount once on mount() and unmount once on the returned disposer', async () => {
    const root = document.getElementById('root')!
    const outcome = await perfHarness.record('mount+unmount', () => {
      const dispose = mount(h('div', null, 'hello'), root)
      dispose()
    })
    expect(outcome.after['runtime.mount']).toBe(1)
    expect(outcome.after['runtime.unmount']).toBe(1)
  })
})

describe('runtime.mountChild', () => {
  it('fires at least once per mount and proportional to the child count', async () => {
    const root = document.getElementById('root')!
    const outcome = await perfHarness.record('mount-3-children', () => {
      const dispose = mount(
        h('div', null, h('span', null, 'a'), h('span', null, 'b'), h('span', null, 'c')),
        root,
      )
      dispose()
    })
    // Exact count depends on mount internals; we assert monotone relationship.
    expect(outcome.after['runtime.mountChild']).toBeGreaterThanOrEqual(3)
  })
})

describe('runtime.mountFor.lisOps', () => {
  it('fires when a <For> list is reordered beyond the small-k fast path (the regression test)', async () => {
    // mountFor has a small-k fast path for tiny lists that skips LIS entirely.
    // Use 100 items so the full LIS reorder path runs. This test catches the
    // bug where `computeForLis` was missing the counter (the twin of the
    // already-instrumented `computeKeyedLis`).
    const N = 100
    const initial = Array.from({ length: N }, (_, i) => i)
    const items = signal(initial)
    const root = document.getElementById('root')!
    const dispose = mount(
      h(
        'ul',
        null,
        h(For, {
          each: () => items(),
          by: (n: number) => n,
          children: (n: number) => h('li', null, String(n)),
        }),
      ),
      root,
    )
    perfHarness.reset()

    const outcome = await perfHarness.record('shuffle', () => {
      items.set([...initial].reverse())
    })
    // Full reversal of 100 items → many binary-search probes.
    expect(outcome.after['runtime.mountFor.lisOps']).toBeGreaterThan(50)

    dispose()
  })

  it('does NOT fire on a fresh-mount (no reorder — no LIS work)', async () => {
    const items = signal([1, 2, 3])
    const root = document.getElementById('root')!
    const outcome = await perfHarness.record('fresh-mount', () => {
      const dispose = mount(
        h(For, {
          each: () => items(),
          by: (n: number) => n,
          children: (n: number) => h('div', null, String(n)),
        }),
        root,
      )
      dispose()
    })
    // Fresh mount → all items are new → no reorder path → no LIS.
    expect(outcome.after['runtime.mountFor.lisOps'] ?? 0).toBe(0)
  })
})
