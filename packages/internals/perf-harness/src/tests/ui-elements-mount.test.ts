// @vitest-environment happy-dom
/**
 * @pyreon/elements mount-cost probe.
 *
 * Element is the base primitive for the entire UI system. Its mount
 * cost compounds across every component that wraps it, so any regression
 * here shows up linearly across a real app.
 */
import { h } from '@pyreon/core'
import { Element } from '@pyreon/elements'
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

describe('@pyreon/elements Element mount cost', () => {
  it('single Element mount — bounded counter footprint', async () => {
    const root = document.getElementById('root')!
    const outcome = await perfHarness.record('one-element', () => {
      const dispose = mount(h(Element, null, 'hello'), root)
      dispose()
    })
    const mountChild = outcome.after['runtime.mountChild'] ?? 0
    const resolve = outcome.after['styler.resolve'] ?? 0
    // oxlint-disable-next-line no-console
    console.log(
      `[ui-elements] single Element: mountChild=${mountChild}, styler.resolve=${resolve}`,
    )
    // Element should fit in a small number of mountChild calls
    expect(mountChild).toBeLessThan(30)
  })

  it('100 Element mounts — linear counter scaling', async () => {
    const root = document.getElementById('root')!
    const outcome = await perfHarness.record('100-elements', () => {
      for (let i = 0; i < 100; i++) {
        const dispose = mount(h(Element, null, `item-${i}`), root)
        dispose()
        resetDom()
      }
    })
    const mountChild = outcome.after['runtime.mountChild'] ?? 0
    const resolve = outcome.after['styler.resolve'] ?? 0
    // oxlint-disable-next-line no-console
    console.log(
      `[ui-elements] 100 Elements: mountChild=${mountChild} (${(mountChild / 100).toFixed(1)}/mount), resolve=${resolve} (${(resolve / 100).toFixed(1)}/mount)`,
    )
    // Per-mount counter should be constant — not growing with mount index.
    expect(mountChild / 100).toBeLessThan(30)
  })

  it('nested Elements (depth 10) — linear in depth', async () => {
    const root = document.getElementById('root')!
    const build = (depth: number): unknown => {
      if (depth === 0) return 'leaf'
      return h(Element, null, build(depth - 1))
    }
    const outcome = await perfHarness.record('depth-10', () => {
      const dispose = mount(build(10) as never, root)
      dispose()
    })
    const mountChild = outcome.after['runtime.mountChild'] ?? 0
    // oxlint-disable-next-line no-console
    console.log(`[ui-elements] depth-10: mountChild=${mountChild}`)
    // 10 nested Elements should produce ~N*constant mountChild, not N² pathology
    expect(mountChild).toBeLessThan(500)
  })
})
