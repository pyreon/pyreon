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

  it('element-child: a baked static element subtree renders + survives mode-flip (no remount)', async () => {
    // Element-child collapse reuses _rsCollapse UNCHANGED — the only delta
    // is that `html` is a baked element SUBTREE (resolver SSR-rendered the
    // real component WITH its static child), and there is NO `bind`
    // callback (the children are static, baked into the clone). This is the
    // runtime proof that the baked subtree (a) renders as real nested
    // elements and (b) is preserved verbatim across a reactive class flip.
    injectCss('.rsc-el{color:rgb(11,11,11)}.rsc-eld{color:rgb(22,22,22)}')
    const isDark = signal(false)
    const root = mountInto(
      _rsCollapse(
        '<button data-x="1"><span class="ico">Save</span></button>',
        'rsc-el',
        'rsc-eld',
        () => isDark(),
      ),
    )
    await flush()
    const btn = query(root, 'button')
    const span = query(root, 'span.ico')
    // The nested element was baked as a REAL element (not flattened to text).
    expect(span.tagName).toBe('SPAN')
    expect(span.className).toBe('ico')
    expect(span.textContent).toBe('Save')
    expect(btn.getAttribute('data-x')).toBe('1')
    expect(btn.className).toBe('rsc-el')

    // Mode flip: root class swaps IN PLACE; the baked child subtree is
    // preserved (same span node identity ⇒ reactive, not a remount).
    isDark.set(true)
    await flush()
    expect(query(root, 'button')).toBe(btn) // root node identity preserved
    expect(query(root, 'span.ico')).toBe(span) // child node identity preserved
    expect(btn.className).toBe('rsc-eld')
    expect(span.textContent).toBe('Save')
    expect(getComputedStyle(btn).color).toBe('rgb(22, 22, 22)')

    isDark.set(false)
    await flush()
    expect(query(root, 'button').className).toBe('rsc-el')
    expect(query(root, 'span.ico').textContent).toBe('Save')
  })

  it('element-child: a RECURSIVE multi-level baked subtree renders whole', async () => {
    // Mirrors the real-corpus mixed shape (text + nested element siblings,
    // e.g. Paragraph "Press <kbd>Enter</kbd> now") + a 2-level nest. Proves
    // the cloned template carries the full subtree depth, in order.
    injectCss('.rsc-rc{color:rgb(33,33,33)}.rsc-rcd{color:rgb(44,44,44)}')
    const isDark = signal(false)
    const root = mountInto(
      _rsCollapse(
        '<button>Press <kbd>Enter</kbd> now <span class="w"><b>Hi</b></span></button>',
        'rsc-rc',
        'rsc-rcd',
        () => isDark(),
      ),
    )
    await flush()
    const btn = query(root, 'button')
    expect(query(root, 'kbd').textContent).toBe('Enter')
    // 2-level nest: <span class="w"><b>Hi</b></span>
    expect(query(root, 'span.w > b').textContent).toBe('Hi')
    // text siblings + order preserved (text before <kbd>, text after).
    expect(btn.textContent).toContain('Press')
    const kbdIdx = (btn.innerHTML).indexOf('<kbd')
    expect(btn.innerHTML.slice(0, kbdIdx)).toContain('Press')
    expect(btn.innerHTML.indexOf('now')).toBeGreaterThan(kbdIdx)
    // mode flip preserves the whole subtree on the same root node.
    isDark.set(true)
    await flush()
    expect(query(root, 'button')).toBe(btn)
    expect(query(root, 'span.w > b').textContent).toBe('Hi')
    expect(btn.className).toBe('rsc-rcd')
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
