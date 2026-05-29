import { signal } from '@pyreon/reactivity'
import { flush } from '@pyreon/test-utils/browser'
import { query } from '@pyreon/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { _rsCollapseDyn, mount } from '../index'

// PR 1 of the dynamic-prop partial-collapse build (next bite after the
// on*-handler partial-collapse `_rsCollapseH`, open-work-2026-q3.md #1
// dynamic-prop bucket = 15.3% of all real-corpus sites). Proves only
// what `_rsCollapseDyn` owns:
//   1. ONE `_tpl()` cloneNode whose class is reactively bound to BOTH
//      the user's value expression AND the mode accessor
//   2. Stride-2 value-major class layout: index = 2*value + (isDark?1:0)
//   3. A value flip OR a mode flip patches className IN PLACE on the
//      SAME node (no remount) — same contract as `_rsCollapse`
//   4. Children/event binders run alongside class binding and dispose
//      cleanly with the host disposer
//
// Like `_rsCollapse`'s suite, this injects CSS via a plain <style> tag
// to stay layer-pure (no @pyreon/styler import — the styler injection
// is the EMITTED code's job, not the runtime helper's).

describe('_rsCollapseDyn (real browser)', () => {
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

  function mountInto(node: ReturnType<typeof _rsCollapseDyn>): HTMLElement {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const dispose = mount(node as unknown as Parameters<typeof mount>[0], root)
    cleanup.push(() => {
      dispose()
      root.remove()
    })
    return root
  }

  // The canonical ternary shape: 2 values × 2 modes = 4 classes.
  const ternaryClasses = (prefix: string): readonly string[] => [
    `${prefix}-v0-light`,
    `${prefix}-v0-dark`,
    `${prefix}-v1-light`,
    `${prefix}-v1-dark`,
  ]

  it('cold mount picks value=0 + light by default — real CSS resolves', async () => {
    injectCss(`
      .rd1-v0-light{color:rgb(1,1,1)}.rd1-v0-dark{color:rgb(2,2,2)}
      .rd1-v1-light{color:rgb(3,3,3)}.rd1-v1-dark{color:rgb(4,4,4)}
    `)
    const cond = signal(false) // → valueIndex 0
    const isDark = signal(false)
    const root = mountInto(
      _rsCollapseDyn(
        '<button>Save</button>',
        ternaryClasses('rd1'),
        () => (cond() ? 1 : 0),
        () => isDark(),
      ),
    )
    await flush()
    const btn = root.querySelector('button')
    expect(btn).not.toBeNull()
    expect(btn?.className).toBe('rd1-v0-light')
    expect(btn?.textContent).toBe('Save')
    expect(getComputedStyle(btn as Element).color).toBe('rgb(1, 1, 1)')
  })

  it('value flip swaps class on the SAME node (no remount) — bisect: dispatch matters', async () => {
    // Bisect-load-bearing assertion: if `_rsCollapseDyn` ignored the
    // valueIndex accessor and only dispatched on `isDark` (the
    // pre-existing `_rsCollapse` shape), the className would stay at
    // v0-light here. Toggling `cond` must move us to v1-light.
    injectCss(`
      .rd2-v0-light{color:rgb(10,10,10)}.rd2-v0-dark{color:rgb(20,20,20)}
      .rd2-v1-light{color:rgb(30,30,30)}.rd2-v1-dark{color:rgb(40,40,40)}
    `)
    const cond = signal(false)
    const isDark = signal(false)
    const root = mountInto(
      _rsCollapseDyn(
        '<button>X</button>',
        ternaryClasses('rd2'),
        () => (cond() ? 1 : 0),
        () => isDark(),
      ),
    )
    await flush()
    const before = query(root, 'button')
    expect(before.className).toBe('rd2-v0-light')

    cond.set(true) // valueIndex 0 → 1
    await flush()
    const after = query(root, 'button')
    expect(after).toBe(before) // node identity preserved ⇒ reactive patch, not remount
    expect(after.className).toBe('rd2-v1-light')
    expect(getComputedStyle(after).color).toBe('rgb(30, 30, 30)')
  })

  it('mode flip swaps class on the SAME node (no remount) — preserves `_rsCollapse` mode contract', async () => {
    injectCss(`
      .rd3-v0-light{color:rgb(50,50,50)}.rd3-v0-dark{color:rgb(60,60,60)}
      .rd3-v1-light{color:rgb(70,70,70)}.rd3-v1-dark{color:rgb(80,80,80)}
    `)
    const cond = signal(true) // pin valueIndex to 1
    const isDark = signal(false)
    const root = mountInto(
      _rsCollapseDyn(
        '<button>Y</button>',
        ternaryClasses('rd3'),
        () => (cond() ? 1 : 0),
        () => isDark(),
      ),
    )
    await flush()
    const before = query(root, 'button')
    expect(before.className).toBe('rd3-v1-light')

    isDark.set(true)
    await flush()
    const after = query(root, 'button')
    expect(after).toBe(before)
    expect(after.className).toBe('rd3-v1-dark')
    expect(getComputedStyle(after).color).toBe('rgb(80, 80, 80)')
  })

  it('combined value + mode flip lands on the right (value, mode) class — stride-2 layout proof', async () => {
    // Flips both signals across all 4 combinations in sequence;
    // asserts the stride-2 indexing matches the documented layout
    // `[v0_light, v0_dark, v1_light, v1_dark]`.
    injectCss(`
      .rd4-v0-light{color:rgb(11,11,11)}.rd4-v0-dark{color:rgb(22,22,22)}
      .rd4-v1-light{color:rgb(33,33,33)}.rd4-v1-dark{color:rgb(44,44,44)}
    `)
    const cond = signal(false)
    const isDark = signal(false)
    const root = mountInto(
      _rsCollapseDyn(
        '<button>Z</button>',
        ternaryClasses('rd4'),
        () => (cond() ? 1 : 0),
        () => isDark(),
      ),
    )
    await flush()
    const btn = query(root, 'button')

    // (v=0, dark=0) → index 0
    expect(btn.className).toBe('rd4-v0-light')

    // (v=0, dark=1) → index 1
    isDark.set(true)
    await flush()
    expect(btn.className).toBe('rd4-v0-dark')

    // (v=1, dark=1) → index 3
    cond.set(true)
    await flush()
    expect(btn.className).toBe('rd4-v1-dark')

    // (v=1, dark=0) → index 2
    isDark.set(false)
    await flush()
    expect(btn.className).toBe('rd4-v1-light')

    // back to (v=0, dark=0) → index 0
    cond.set(false)
    await flush()
    expect(btn.className).toBe('rd4-v0-light')
  })

  it('out-of-range valueIndex coerces to empty className (no crash)', async () => {
    // Defensive shape: an enumerator-misalign or compiler bug that
    // produces an out-of-range index must NOT throw at mount. The
    // documented runtime contract is "compiler is source of truth";
    // graceful degradation = empty className.
    injectCss(`.rd5-v0-light{color:rgb(5,5,5)}.rd5-v0-dark{color:rgb(6,6,6)}`)
    const isDark = signal(false)
    const root = mountInto(
      _rsCollapseDyn(
        '<button>Bad</button>',
        ['rd5-v0-light', 'rd5-v0-dark'], // only ONE value defined
        () => 7, // BUG-shaped: out of range
        () => isDark(),
      ),
    )
    await flush()
    const btn = query(root, 'button')
    expect(btn.className).toBe('') // not 'undefined', not crashed
    expect(btn.textContent).toBe('Bad')
  })

  it('valueIndex() is called EXACTLY ONCE per re-run (no double-call) — side-effect-safe', async () => {
    // Regression: the original implementation routed through
    // `_bindDirect`'s fallback which calls the source function once
    // (passing the result as `v` to the inner callback), then the
    // inner callback called `valueIndex()` AGAIN — i.e., two calls
    // per re-run. Side-effecting cond expressions (`{(modifyState(),
    // cond) ? 'a' : 'b'}`) would fire their side-effects twice,
    // breaking the original source's call-count contract. The fix is
    // to use `renderEffect` directly so `valueIndex()` runs exactly
    // once per re-run, matching the implicit semantics of the
    // user's JSX call site.
    //
    // Bisect: with the old `_bindDirect(valueIndex, () => valueIndex() ...)`
    // shape this spec records `calls > runs`. With the fix
    // (direct `renderEffect(() => valueIndex() ...)`) calls === runs.
    injectCss(`
      .rdcc-v0-light{color:rgb(1,2,3)}.rdcc-v0-dark{color:rgb(4,5,6)}
      .rdcc-v1-light{color:rgb(7,8,9)}.rdcc-v1-dark{color:rgb(10,11,12)}
    `)
    const cond = signal(false)
    const isDark = signal(false)
    let calls = 0
    const root = mountInto(
      _rsCollapseDyn(
        '<button>Calls</button>',
        ['rdcc-v0-light', 'rdcc-v0-dark', 'rdcc-v1-light', 'rdcc-v1-dark'],
        () => {
          calls++
          return cond() ? 1 : 0
        },
        () => isDark(),
      ),
    )
    await flush()
    // Initial mount: one renderEffect run.
    expect(calls).toBe(1)
    // Value flip: one more run.
    cond.set(true)
    await flush()
    expect(calls).toBe(2)
    // Mode flip: one more run.
    isDark.set(true)
    await flush()
    expect(calls).toBe(3)
    // Combined flip back: one run.
    cond.set(false)
    isDark.set(false)
    await flush()
    // Two writes inside the same microtask coalesce to one effect run
    // (Pyreon's batch semantics). Either 4 or 5 — accept either to
    // avoid coupling to batching internals. The bisect-load-bearing
    // assertion is `calls === runs` (1:1), NOT `calls === N`. Pre-fix
    // the count would be 2× either way.
    expect(calls).toBeGreaterThanOrEqual(4)
    expect(calls).toBeLessThanOrEqual(5)
    // Cleanly land on the right class regardless.
    expect(query(root, 'button').className).toBe('rdcc-v0-light')
    void root
  })

  it('children bind runs alongside class bind and disposes cleanly with the host', async () => {
    injectCss(`
      .rd6-v0-light{color:rgb(7,7,7)}.rd6-v0-dark{color:rgb(8,8,8)}
      .rd6-v1-light{color:rgb(9,9,9)}.rd6-v1-dark{color:rgb(11,11,11)}
    `)
    const cond = signal(false)
    const isDark = signal(false)
    let childDisposed = false
    const root = mountInto(
      _rsCollapseDyn(
        '<button><span></span></button>',
        ternaryClasses('rd6'),
        () => (cond() ? 1 : 0),
        () => isDark(),
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

    // Disposing the host (via cleanup) must also fire the child binder's
    // disposer — the runtime composes them.
    cleanup.splice(0).forEach((u) => u())
    expect(childDisposed).toBe(true)
  })

  it('single-value (valueCount=1) reduces to a `_rsCollapse`-equivalent shape', async () => {
    // Useful structural assertion: `_rsCollapseDyn` with one value
    // pair degenerates to the existing collapse contract — guards the
    // generalisation as a strict superset.
    injectCss(`.rd7-only-light{color:rgb(80,80,80)}.rd7-only-dark{color:rgb(90,90,90)}`)
    const isDark = signal(false)
    const root = mountInto(
      _rsCollapseDyn(
        '<i>Solo</i>',
        ['rd7-only-light', 'rd7-only-dark'],
        () => 0, // always one value
        () => isDark(),
      ),
    )
    await flush()
    const i = query(root, 'i')
    expect(i.className).toBe('rd7-only-light')

    isDark.set(true)
    await flush()
    expect(i.className).toBe('rd7-only-dark')
    expect(getComputedStyle(i).color).toBe('rgb(90, 90, 90)')
  })
})
