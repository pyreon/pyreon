// @vitest-environment happy-dom
/**
 * Conditional-rendering leak probe.
 *
 * `<Show>`, `<Switch>`, and conditional `<For>` each other all mount
 * subtrees that must tear down cleanly on the flip. This probe toggles
 * N times and asserts no accumulating counters.
 */
import { For, h, Show, Switch, Match } from '@pyreon/core'
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

describe('conditional rendering', () => {
  it('<Show> toggle 50 times — no accumulating signal/effect leaks', async () => {
    const flag = signal(false)
    const root = document.getElementById('root')!

    const dispose = mount(
      h(Show, {
        when: () => flag(),
        children: h('div', null, 'shown'),
      }),
      root,
    )

    // Warm up
    flag.set(true)
    flag.set(false)
    perfHarness.reset()

    const outcome = await perfHarness.record('show-toggle-50', () => {
      for (let i = 0; i < 50; i++) {
        flag.set(true)
        flag.set(false)
      }
    })

    // 50 true + 50 false = 100 toggles. Each write fires the Show's accessor
    // once. mountChild grows by at most O(N) per toggle, not O(N²).
    const mountChild = outcome.after['runtime.mountChild'] ?? 0
    const effectRun = outcome.after['reactivity.effectRun'] ?? 0
    // oxlint-disable-next-line no-console
    console.log(
      `[conditional] Show×50: mountChild=${mountChild}, effectRun=${effectRun}, signalWrite=${outcome.after['reactivity.signalWrite']}`,
    )
    // Hard bound: mountChild per toggle should be small and constant.
    expect(mountChild).toBeLessThan(1000)
    dispose()
  })

  it('<Show> with component-scoped effect — effect disposes on hide', async () => {
    const flag = signal(true)
    const s = signal(0)
    let nestedRuns = 0
    const Body = () => {
      effect(() => {
        s()
        nestedRuns++
      })
      return h('div', null, 'body')
    }
    const root = document.getElementById('root')!

    const dispose = mount(
      h(Show, {
        when: () => flag(),
        children: h(Body, null),
      }),
      root,
    )

    const initialRuns = nestedRuns
    s.set(1) // component effect fires
    const afterWrite = nestedRuns
    expect(afterWrite).toBeGreaterThan(initialRuns)

    flag.set(false) // hide → unmounts Body → should dispose its effect scope
    const afterHide = nestedRuns

    s.set(2) // effect should NOT fire (component unmounted)
    const afterSecondWrite = nestedRuns

    expect(
      afterSecondWrite,
      `component effect leaked past Show's hide: ${afterHide} → ${afterSecondWrite}`,
    ).toBe(afterHide)
    dispose()
  })

  it('<For> shrinking a list removes disposed entries from counters', async () => {
    const items = signal([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const root = document.getElementById('root')!
    const dispose = mount(
      h(For, {
        each: () => items(),
        by: (n: number) => n,
        children: (n: number) => h('li', null, String(n)),
      }),
      root,
    )
    perfHarness.reset()
    const outcome = await perfHarness.record('shrink', () => {
      items.set([1, 2, 3])
    })
    // Shrinking → removed entries are cleaned up; new entries = 0
    const mountChild = outcome.after['runtime.mountChild'] ?? 0
    expect(mountChild).toBe(0) // no new mounts, just removes
    dispose()
  })
})
