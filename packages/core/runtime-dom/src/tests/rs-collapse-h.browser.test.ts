import { signal } from '@pyreon/reactivity'
import { flush } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { _rsCollapseH, mount } from '../index'

// PR 2 of the partial-collapse build (open-work #1), in REAL Chromium.
// `_rsCollapseH` = `_rsCollapse` (one _tpl cloneNode, dual-emit reactive
// class, no remount) PLUS it re-attaches the residual `on*` handlers the
// compiler's `detectPartialCollapsibleShape` (PR 1) peeled off. The ONLY
// delta vs `_rsCollapse` is the handler re-attach, routed through the
// canonical `_bindEvent` → `applyEventProp` path — so a partially-
// collapsed `<Button onClick=…>` behaves byte-identically to the
// 5-layer mount it replaced. These specs prove exactly that delta in a
// real browser (real click/pointer events, real computed style).
//
// Bisect-verify (PR body): neutralize the handler loop in
// `_rsCollapseH` (`for (const key in handlers)` → no-op) → the 3
// handler specs fail (`expected 0 to be 1` — handler never fired) while
// every class/mode/no-remount assertion still passes; restore → all
// pass. That asymmetry proves the handler re-attach is the load-bearing
// addition, not passing for the wrong reason.

describe('_rsCollapseH (real browser) — PR 2 partial-collapse runtime', () => {
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

  function mountInto(node: ReturnType<typeof _rsCollapseH>): HTMLElement {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const dispose = mount(node as unknown as Parameters<typeof mount>[0], root)
    cleanup.push(() => {
      dispose()
      root.remove()
    })
    return root
  }

  it('applies the light class AND fires the peeled onClick on a real click', async () => {
    injectCss('.rsh-l{color:rgb(1,2,3)}.rsh-d{color:rgb(9,8,7)}')
    const isDark = signal(false)
    let clicks = 0
    const root = mountInto(
      _rsCollapseH('<button>Save</button>', 'rsh-l', 'rsh-d', () => isDark(), {
        onClick: () => {
          clicks++
        },
      }),
    )
    await flush()
    const btn = root.querySelector('button') as HTMLButtonElement
    expect(btn).not.toBeNull()
    expect(btn.className).toBe('rsh-l')
    expect(btn.textContent).toBe('Save')
    expect(getComputedStyle(btn).color).toBe('rgb(1, 2, 3)')

    btn.click()
    expect(clicks).toBe(1)
    btn.click()
    expect(clicks).toBe(2)
  })

  it('mode flip swaps the class on the SAME node AND the handler survives the flip', async () => {
    injectCss('.rsh-l2{color:rgb(10,20,30)}.rsh-d2{color:rgb(40,50,60)}')
    const isDark = signal(false)
    let clicks = 0
    const root = mountInto(
      _rsCollapseH('<button>X</button>', 'rsh-l2', 'rsh-d2', () => isDark(), {
        onClick: () => {
          clicks++
        },
      }),
    )
    await flush()
    const before = root.querySelector('button') as HTMLButtonElement
    expect(before.className).toBe('rsh-l2')
    before.click()
    expect(clicks).toBe(1)

    isDark.set(true)
    await flush()
    const after = root.querySelector('button') as HTMLButtonElement
    expect(after).toBe(before) // node identity preserved ⇒ reactive, not remount
    expect(after.className).toBe('rsh-d2')
    // The load-bearing partial-collapse contract: the reactive class
    // binding does NOT remount, so the handler attached at first mount is
    // still live after the mode flip.
    after.click()
    expect(clicks).toBe(2)
  })

  it('peels + binds MULTIPLE handlers with correct onXxx→event normalization', async () => {
    injectCss('.rsh-m{color:rgb(0,0,0)}')
    const isDark = signal(false)
    let clicks = 0
    let enters = 0
    const root = mountInto(
      _rsCollapseH('<button>M</button>', 'rsh-m', 'rsh-m', () => isDark(), {
        onClick: () => {
          clicks++
        },
        // onPointerEnter must normalize to the lowercase DOM event
        // `pointerenter` via the canonical path — a hand-rolled
        // `addEventListener('pointerEnter', …)` would never fire.
        onPointerEnter: () => {
          enters++
        },
      }),
    )
    await flush()
    const btn = root.querySelector('button') as HTMLButtonElement
    btn.click()
    btn.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false }))
    expect(clicks).toBe(1)
    expect(enters).toBe(1)
  })

  it('dispose removes the listener (no leak) — composed cleanup is correct', async () => {
    injectCss('.rsh-c{color:rgb(5,5,5)}')
    const isDark = signal(false)
    let clicks = 0
    const root = document.createElement('div')
    document.body.appendChild(root)
    const dispose = mount(
      _rsCollapseH('<button>C</button>', 'rsh-c', 'rsh-c', () => isDark(), {
        onClick: () => {
          clicks++
        },
      }) as unknown as Parameters<typeof mount>[0],
      root,
    )
    await flush()
    const btn = root.querySelector('button') as HTMLButtonElement
    btn.click()
    expect(clicks).toBe(1)

    dispose()
    // After dispose the handler disposer ran — the listener is gone, so a
    // post-dispose click does NOT increment.
    btn.click()
    expect(clicks).toBe(1)
    root.remove()
  })
})
