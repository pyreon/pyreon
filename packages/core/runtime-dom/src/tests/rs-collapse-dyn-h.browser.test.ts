import { signal } from '@pyreon/reactivity'
import { flush } from '@pyreon/test-utils/browser'
import { query } from '@pyreon/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { _rsCollapseDynH, mount } from '../index'

// Runtime helper for the HANDLER-COMBINED dynamic-collapse slice — the
// follow-up to the strict no-handler PR sequence (#765/#766/#767/#771).
// Closes the largest remaining real-corpus dynamic-collapse gap: the
// `<Button state={cond ? 'a' : 'b'} onClick={h}>` shape that PR #767's
// `tryDynamicCollapse` BAILED by design ("PR 3 scope: no-handler only").
//
// Structurally the union of:
//   - `_rsCollapseDyn`'s stride-2 value-major class dispatch
//   - `_rsCollapseH`'s handler re-attachment via `_bindEvent`
//
// Proves what `_rsCollapseDynH` owns:
//   1. Class dispatch identical to `_rsCollapseDyn` (value flip / mode
//      flip / combined flip all patch className IN PLACE on SAME node)
//   2. Handlers attached + dispatched correctly across value flips
//      (handler identity preserved; same el; click fires once per click)
//   3. Both dispatchers + handlers compose without interference —
//      handler stays attached after a value flip, value dispatch keeps
//      working after handler invocation, mode flip doesn't break handlers
//   4. Disposers chained — class, all handlers, children all cleaned up
//
// Layer-pure: no @pyreon/styler import — CSS via plain <style> just
// like the existing rs-collapse-dyn / rs-collapse-h suites.

describe('_rsCollapseDynH (real browser)', () => {
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

  function mountInto(node: ReturnType<typeof _rsCollapseDynH>): HTMLElement {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const dispose = mount(node as unknown as Parameters<typeof mount>[0], root)
    cleanup.push(() => {
      dispose()
      root.remove()
    })
    return root
  }

  const ternaryClasses = (prefix: string): readonly string[] => [
    `${prefix}-v0-light`,
    `${prefix}-v0-dark`,
    `${prefix}-v1-light`,
    `${prefix}-v1-dark`,
  ]

  it('cold mount picks value=0 + light + attaches handlers', async () => {
    injectCss(`
      .rdh1-v0-light{color:rgb(1,1,1)}.rdh1-v0-dark{color:rgb(2,2,2)}
      .rdh1-v1-light{color:rgb(3,3,3)}.rdh1-v1-dark{color:rgb(4,4,4)}
    `)
    const cond = signal(false)
    const isDark = signal(false)
    let clicks = 0
    const root = mountInto(
      _rsCollapseDynH(
        '<button>Save</button>',
        ternaryClasses('rdh1'),
        () => (cond() ? 1 : 0),
        () => isDark(),
        { onClick: () => clicks++ },
      ),
    )
    await flush()
    const btn = query(root, 'button')
    expect(btn.className).toBe('rdh1-v0-light')
    btn.click()
    expect(clicks).toBe(1)
  })

  it('value flip swaps class on SAME node — handler stays attached', async () => {
    injectCss(`
      .rdh2-v0-light{color:rgb(10,10,10)}.rdh2-v0-dark{color:rgb(20,20,20)}
      .rdh2-v1-light{color:rgb(30,30,30)}.rdh2-v1-dark{color:rgb(40,40,40)}
    `)
    const cond = signal(false)
    const isDark = signal(false)
    let clicks = 0
    const root = mountInto(
      _rsCollapseDynH(
        '<button>X</button>',
        ternaryClasses('rdh2'),
        () => (cond() ? 1 : 0),
        () => isDark(),
        { onClick: () => clicks++ },
      ),
    )
    await flush()
    const before = query(root, 'button')
    before.click()
    expect(clicks).toBe(1)

    cond.set(true)
    await flush()
    const after = query(root, 'button')
    expect(after).toBe(before) // node identity preserved
    expect(after.className).toBe('rdh2-v1-light')

    // Handler still attached post-value-flip — same closure, same callback identity
    after.click()
    expect(clicks).toBe(2)
  })

  it('mode flip swaps class on SAME node — handler stays attached (preserves _rsCollapseH contract)', async () => {
    injectCss(`
      .rdh3-v0-light{color:rgb(50,50,50)}.rdh3-v0-dark{color:rgb(60,60,60)}
      .rdh3-v1-light{color:rgb(70,70,70)}.rdh3-v1-dark{color:rgb(80,80,80)}
    `)
    const cond = signal(true) // pin valueIndex to 1
    const isDark = signal(false)
    let clicks = 0
    const root = mountInto(
      _rsCollapseDynH(
        '<button>Y</button>',
        ternaryClasses('rdh3'),
        () => (cond() ? 1 : 0),
        () => isDark(),
        { onClick: () => clicks++ },
      ),
    )
    await flush()
    const before = query(root, 'button')
    expect(before.className).toBe('rdh3-v1-light')

    isDark.set(true)
    await flush()
    const after = query(root, 'button')
    expect(after).toBe(before)
    expect(after.className).toBe('rdh3-v1-dark')
    after.click()
    expect(clicks).toBe(1)
  })

  it('combined value + mode flip lands on the right class — handler invariant across all 4 combinations', async () => {
    injectCss(`
      .rdh4-v0-light{color:rgb(11,11,11)}.rdh4-v0-dark{color:rgb(22,22,22)}
      .rdh4-v1-light{color:rgb(33,33,33)}.rdh4-v1-dark{color:rgb(44,44,44)}
    `)
    const cond = signal(false)
    const isDark = signal(false)
    let clicks = 0
    const root = mountInto(
      _rsCollapseDynH(
        '<button>Z</button>',
        ternaryClasses('rdh4'),
        () => (cond() ? 1 : 0),
        () => isDark(),
        { onClick: () => clicks++ },
      ),
    )
    await flush()
    const btn = query(root, 'button')

    expect(btn.className).toBe('rdh4-v0-light')
    btn.click()
    isDark.set(true)
    await flush()
    expect(btn.className).toBe('rdh4-v0-dark')
    btn.click()
    cond.set(true)
    await flush()
    expect(btn.className).toBe('rdh4-v1-dark')
    btn.click()
    isDark.set(false)
    await flush()
    expect(btn.className).toBe('rdh4-v1-light')
    btn.click()
    // 4 clicks across 4 combinations, all on the SAME node
    expect(clicks).toBe(4)
  })

  it('multiple handlers — all attach + survive value/mode flips', async () => {
    injectCss(
      `.rdh5-v0-light{color:rgb(1,1,1)}.rdh5-v0-dark{color:rgb(2,2,2)}.rdh5-v1-light{color:rgb(3,3,3)}.rdh5-v1-dark{color:rgb(4,4,4)}`,
    )
    const cond = signal(false)
    const isDark = signal(false)
    let clicks = 0
    let enters = 0
    const root = mountInto(
      _rsCollapseDynH(
        '<button>M</button>',
        ternaryClasses('rdh5'),
        () => (cond() ? 1 : 0),
        () => isDark(),
        {
          onClick: () => clicks++,
          onPointerEnter: () => enters++,
        },
      ),
    )
    await flush()
    const btn = query(root, 'button')
    btn.click()
    btn.dispatchEvent(new PointerEvent('pointerenter'))
    expect(clicks).toBe(1)
    expect(enters).toBe(1)

    cond.set(true)
    await flush()
    btn.click()
    btn.dispatchEvent(new PointerEvent('pointerenter'))
    expect(clicks).toBe(2)
    expect(enters).toBe(2)
  })

  it('out-of-range valueIndex coerces to empty className — handlers still work', async () => {
    // Same graceful-degradation contract as `_rsCollapseDyn`: an out-
    // of-range index is documented as "compiler is source of truth";
    // empty className is the runtime fallback, never a crash. Handlers
    // are orthogonal to class dispatch and must keep working.
    injectCss(`.rdh6-v0-light{color:rgb(5,5,5)}.rdh6-v0-dark{color:rgb(6,6,6)}`)
    let clicks = 0
    const root = mountInto(
      _rsCollapseDynH(
        '<button>Bad</button>',
        ['rdh6-v0-light', 'rdh6-v0-dark'], // only ONE value
        () => 7, // BUG-shaped: out of range
        () => false,
        { onClick: () => clicks++ },
      ),
    )
    await flush()
    const btn = query(root, 'button')
    expect(btn.className).toBe('') // graceful
    btn.click()
    expect(clicks).toBe(1) // handler unaffected
  })

  it('children binder runs alongside class + handlers; ALL three dispose with the host', async () => {
    injectCss(
      `.rdh7-v0-light{color:rgb(7,7,7)}.rdh7-v0-dark{color:rgb(8,8,8)}.rdh7-v1-light{color:rgb(9,9,9)}.rdh7-v1-dark{color:rgb(11,11,11)}`,
    )
    const cond = signal(false)
    const isDark = signal(false)
    let clicks = 0
    let childDisposed = false
    const root = mountInto(
      _rsCollapseDynH(
        '<button><span></span></button>',
        ternaryClasses('rdh7'),
        () => (cond() ? 1 : 0),
        () => isDark(),
        { onClick: () => clicks++ },
        (el) => {
          const span = query(el, 'span')
          span.textContent = 'child'
          return () => {
            childDisposed = true
          }
        },
      ),
    )
    await flush()
    expect(query(root, 'span').textContent).toBe('child')
    query(root, 'button').click()
    expect(clicks).toBe(1)

    // Disposing the host (via cleanup) must fire ALL three disposers:
    // class binding, handler bindings, child binder. Bisect-load-bearing
    // for the disposer-chain composition shape.
    cleanup.splice(0).forEach((u) => u())
    expect(childDisposed).toBe(true)
  })

  it('zero handlers (empty {}) degenerates to `_rsCollapseDyn`-equivalent shape', async () => {
    // Useful structural assertion: `_rsCollapseDynH` with no handlers
    // behaves identically to `_rsCollapseDyn`. Guards the union as a
    // strict superset — emit can always route to DynH; lighter-weight
    // Dyn is just the no-handler optimization.
    injectCss(
      `.rdh8-v0-light{color:rgb(80,80,80)}.rdh8-v0-dark{color:rgb(90,90,90)}.rdh8-v1-light{color:rgb(100,100,100)}.rdh8-v1-dark{color:rgb(110,110,110)}`,
    )
    const cond = signal(false)
    const isDark = signal(false)
    const root = mountInto(
      _rsCollapseDynH(
        '<button>Solo</button>',
        ternaryClasses('rdh8'),
        () => (cond() ? 1 : 0),
        () => isDark(),
        {}, // no handlers
      ),
    )
    await flush()
    const btn = query(root, 'button')
    expect(btn.className).toBe('rdh8-v0-light')

    cond.set(true)
    await flush()
    expect(btn.className).toBe('rdh8-v1-light')
    isDark.set(true)
    await flush()
    expect(btn.className).toBe('rdh8-v1-dark')
  })
})
