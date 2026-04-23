// @vitest-environment happy-dom
/**
 * Heap stability probe.
 *
 * Rapid mount/unmount cycles of a realistic component should produce
 * stable counter shapes — no accumulation beyond the per-cycle growth.
 *
 * happy-dom doesn't give us real heap numbers, but we use counter
 * emissions as a proxy: if cycle 100 emits more than cycle 1, something's
 * accumulating state that should have been cleaned up.
 */
import { For, h, Show } from '@pyreon/core'
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

describe('heap stability under rapid lifecycle', () => {
  it('mount/unmount the same tree 100× — counter shape is identical across cycles', async () => {
    const root = document.getElementById('root')!
    const Component = () => {
      const count = signal(0)
      effect(() => {
        count() // establish reactive dep
      })
      return h('div', null, h('span', null, String(count())))
    }

    const snapshots: Record<string, number>[] = []
    for (let cycle = 0; cycle < 100; cycle++) {
      perfHarness.reset()
      const dispose = mount(h(Component, null), root)
      dispose()
      snapshots.push(perfHarness.snapshot())
    }

    // Compare cycle 0 with cycle 99 — shape should be identical (no growth)
    const first = JSON.stringify(snapshots[0], Object.keys(snapshots[0]!).sort())
    const last = JSON.stringify(snapshots[99], Object.keys(snapshots[99]!).sort())
    expect(last, `heap leak: cycle 0 = ${first}, cycle 99 = ${last}`).toBe(first)
  })

  it('mount/unmount a 100-item list 20 times — no counter drift', async () => {
    const root = document.getElementById('root')!
    const first: Record<string, number>[] = []
    const last: Record<string, number>[] = []
    for (let cycle = 0; cycle < 20; cycle++) {
      const items = signal(Array.from({ length: 100 }, (_, i) => i))
      perfHarness.reset()
      const dispose = mount(
        h(For, {
          each: () => items(),
          by: (n: number) => n,
          children: (n: number) => h('li', null, String(n)),
        }),
        root,
      )
      dispose()
      if (cycle < 3) first.push(perfHarness.snapshot())
      if (cycle >= 17) last.push(perfHarness.snapshot())
    }
    // First 3 and last 3 cycles should have identical counter shapes
    expect(JSON.stringify(last[0], Object.keys(last[0]!).sort())).toBe(
      JSON.stringify(first[0], Object.keys(first[0]!).sort()),
    )
  })

  it('toggling a <Show> 50 times — counters stable', async () => {
    const root = document.getElementById('root')!
    const flag = signal(false)
    const Body = () => {
      effect(() => {
        flag() // reactive dep inside the body
      })
      return h('div', null, 'body')
    }
    const dispose = mount(
      h(Show, {
        when: () => flag(),
        children: h(Body, null),
      }),
      root,
    )

    // warm up
    flag.set(true)
    flag.set(false)

    const cycleSnapshots: Record<string, number>[] = []
    for (let cycle = 0; cycle < 50; cycle++) {
      perfHarness.reset()
      flag.set(true)
      flag.set(false)
      cycleSnapshots.push(perfHarness.snapshot())
    }
    // All cycles produce the same counter signature
    const normalised = cycleSnapshots.map((s) => JSON.stringify(s, Object.keys(s).sort()))
    const unique = new Set(normalised)
    expect(unique.size, `Show toggle produced ${unique.size} distinct counter shapes across 50 cycles`).toBe(1)
    dispose()
  })
})
