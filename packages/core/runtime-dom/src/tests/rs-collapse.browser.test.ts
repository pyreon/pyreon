import { signal } from '@pyreon/reactivity'
import { flush } from '@pyreon/test-utils/browser'
import { query } from '@pyreon/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { _rsCollapse, mount } from '../index'

// Layer 2 of the P0 rocketstyle-collapse slice, in real Chromium.
// `_rsCollapse` deliberately does NOT import @pyreon/styler (layer
// purity — runtime-dom is layer 4; the styler injection is the EMITTED
// code's job). So this suite injects CSS via a plain <style> and proves
// only what _rsCollapse owns: ONE _tpl() cloneNode whose class is
// reactively bound to the app mode (dual-emit, RFC decision 1) — a mode
// flip swaps the class on the SAME node with no remount.

describe('_rsCollapse (real browser)', () => {
  const cleanup: Array<() => void> = []
  afterEach(() => {
    for (const u of cleanup.splice(0)) u()
  })

  function injectCss(css: string): void {
    const el = document.createElement('style')
    el.textContent = css
    document.head.appendChild(el)
    cleanup.push(() => el.remove())
  }

  function mountInto(node: ReturnType<typeof _rsCollapse>): HTMLElement {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const dispose = mount(node as unknown as Parameters<typeof mount>[0], root)
    cleanup.push(() => {
      dispose()
      root.remove()
    })
    return root
  }

  it('applies the light class + static children; the class is real CSS', async () => {
    injectCss('.rsc-light{color:rgb(1,2,3)}.rsc-dark{color:rgb(9,8,7)}')
    const isDark = signal(false)
    const root = mountInto(
      _rsCollapse('<button>Save</button>', 'rsc-light', 'rsc-dark', () => isDark()),
    )
    await flush()
    const btn = root.querySelector('button')
    expect(btn).not.toBeNull()
    expect(btn?.className).toBe('rsc-light')
    expect(btn?.textContent).toBe('Save')
    expect(getComputedStyle(btn as Element).color).toBe('rgb(1, 2, 3)')
  })

  it('mode flip swaps to the dark class on the SAME node (no remount)', async () => {
    injectCss('.rsc-l2{color:rgb(10,20,30)}.rsc-d2{color:rgb(40,50,60)}')
    const isDark = signal(false)
    const root = mountInto(
      _rsCollapse('<button>X</button>', 'rsc-l2', 'rsc-d2', () => isDark()),
    )
    await flush()
    const before = query(root, 'button')
    expect(before.className).toBe('rsc-l2')

    isDark.set(true)
    await flush()
    const after = query(root, 'button')
    expect(after).toBe(before) // node identity preserved ⇒ reactive, not remount
    expect(after.className).toBe('rsc-d2')
    expect(getComputedStyle(after).color).toBe('rgb(40, 50, 60)')

    isDark.set(false)
    await flush()
    expect((query(root, 'button')).className).toBe('rsc-l2')
  })

  it('children bind runs alongside the class bind and disposes cleanly', async () => {
    injectCss('.rsc-c{color:rgb(2,2,2)}.rsc-cd{color:rgb(3,3,3)}')
    const label = signal('one')
    const isDark = signal(false)
    let childDisposed = false
    const root = mountInto(
      _rsCollapse(
        '<button><span></span></button>',
        'rsc-c',
        'rsc-cd',
        () => isDark(),
        (el) => {
          const span = query(el, 'span')
          const stop = (() => {
            // minimal reactive child without pulling the compiler in
            let raf = 0
            const tick = () => {
              span.textContent = label()
              raf = requestAnimationFrame(tick)
            }
            tick()
            return () => {
              cancelAnimationFrame(raf)
              childDisposed = true
            }
          })()
          return stop
        },
      ),
    )
    await flush()
    expect((query(root, 'span')).textContent).toBe('one')
    expect((query(root, 'button')).className).toBe('rsc-c')
    // dispose via afterEach → child cleanup must fire
    for (const u of cleanup.splice(0)) u()
    expect(childDisposed).toBe(true)
  })

  it('two instances of the same html share ONE parsed template, with independent reactivity', async () => {
    injectCss('.rsc-s{color:rgb(7,7,7)}.rsc-sd{color:rgb(8,8,8)}')
    const isDark = signal(false)
    const r1 = mountInto(_rsCollapse('<button>dup</button>', 'rsc-s', 'rsc-sd', () => isDark()))
    const r2 = mountInto(_rsCollapse('<button>dup</button>', 'rsc-s', 'rsc-sd', () => isDark()))
    await flush()
    const b1 = query(r1, 'button')
    const b2 = query(r2, 'button')
    expect(b1).not.toBe(b2) // distinct cloned nodes from the shared template
    expect(b1.className).toBe('rsc-s')
    expect(b2.className).toBe('rsc-s')
    isDark.set(true)
    await flush()
    expect((query(r1, 'button')).className).toBe('rsc-sd')
    expect((query(r2, 'button')).className).toBe('rsc-sd')
  })
})
