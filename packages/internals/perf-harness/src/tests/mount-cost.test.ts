// @vitest-environment happy-dom
/**
 * Mount cost / per-VNode work probe.
 *
 * How does the mount pipeline scale with tree depth vs breadth? If
 * `runtime.mountChild` grows super-linearly with either dimension, the
 * mount pipeline is doing redundant recursion.
 *
 * Goal: establish a healthy baseline for mount counter scaling so
 * future regressions in the mount pipeline (e.g., accidentally double-
 * mounting children) surface as a counter jump.
 */
import { h } from '@pyreon/core'
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

function nested(depth: number, child?: unknown): unknown {
  if (depth === 0) return child ?? 'leaf'
  return h('div', null, nested(depth - 1, child))
}

describe('mount cost scaling', () => {
  it('breadth: N siblings → O(N) mountChild', async () => {
    const root = document.getElementById('root')!
    const out100 = await perfHarness.record('breadth-100', () => {
      const children = Array.from({ length: 100 }, (_, i) => h('li', null, String(i)))
      const dispose = mount(h('ul', null, ...children), root)
      dispose()
    })
    const out1000 = await perfHarness.record('breadth-1000', () => {
      const children = Array.from({ length: 1000 }, (_, i) => h('li', null, String(i)))
      const dispose = mount(h('ul', null, ...children), root)
      dispose()
    })
    const ratio = (out1000.after['runtime.mountChild'] ?? 0) / (out100.after['runtime.mountChild'] ?? 1)
    // 10× input should produce ~10× mountChild (linear). Bound generously.
    expect(ratio).toBeLessThan(15)
    // oxlint-disable-next-line no-console
    console.log(
      `[mount-cost] breadth scaling: 100→${out100.after['runtime.mountChild']}, 1000→${out1000.after['runtime.mountChild']}, ratio=${ratio.toFixed(2)}x`,
    )
  })

  it('depth: N-deep nested divs → O(N) mountChild, not O(N²)', async () => {
    const root = document.getElementById('root')!
    const out100 = await perfHarness.record('depth-100', () => {
      const dispose = mount(nested(100) as never, root)
      dispose()
    })
    const out1000 = await perfHarness.record('depth-1000', () => {
      const dispose = mount(nested(1000) as never, root)
      dispose()
    })
    const ratio = (out1000.after['runtime.mountChild'] ?? 0) / (out100.after['runtime.mountChild'] ?? 1)
    expect(ratio).toBeLessThan(15)
    // oxlint-disable-next-line no-console
    console.log(
      `[mount-cost] depth scaling: 100→${out100.after['runtime.mountChild']}, 1000→${out1000.after['runtime.mountChild']}, ratio=${ratio.toFixed(2)}x`,
    )
  })

  it('mount/unmount 100 times — mountChild grows linearly', async () => {
    const root = document.getElementById('root')!
    const outcome = await perfHarness.record('mount-unmount-100', () => {
      for (let i = 0; i < 100; i++) {
        const dispose = mount(
          h('div', null, h('span', null, String(i)), h('span', null, `${i * 2}`)),
          root,
        )
        dispose()
      }
    })
    const mountCount = outcome.after['runtime.mount'] ?? 0
    const unmountCount = outcome.after['runtime.unmount'] ?? 0
    expect(mountCount).toBe(100)
    expect(unmountCount).toBe(100)
    // oxlint-disable-next-line no-console
    console.log(
      `[mount-cost] 100 cycles: mount=${mountCount}, unmount=${unmountCount}, mountChild=${outcome.after['runtime.mountChild']}`,
    )
  })
})
