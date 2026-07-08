/**
 * Template ref-hoist regression tests (PZ-08).
 *
 * A reactive/conditional slot (`{cond() ? <A/> : <B/>}`, `{cond && <el/>}`)
 * placed BEFORE static siblings used to break the compiled template's sibling
 * ref-walk: `_mountSlot` mounts content + a `<!--pyreon-->` marker before the
 * `<!>` placeholder and then REMOVES the placeholder (net sibling-count delta
 * ≠ 0), so any `const __eN = __root.firstChild.nextSibling…` walk emitted
 * AFTER the `_mountSlot` line landed on the marker comment (or null) —
 * `_setStyle` threw `Cannot read properties of undefined (reading
 * 'setProperty')`, `setAttribute` threw on null, text captures grabbed the
 * wrong node. With TWO sibling slots, the second slot's own inline
 * placeholder-walk argument resolved to the FIRST slot's reactive marker,
 * which `_mountSlot` then removed — a later falsy→truthy re-flip of slot 0
 * crashed `insertBefore` against the detached marker and SILENTLY LOST the
 * subtree.
 *
 * The fix: two-phase template-bind emission. Phase 1 (`refLines`) captures
 * EVERY pristine-clone node reference — element walks (`const __eN = …`),
 * sole-text captures (`const __tN = X.firstChild`), and NEW hoisted
 * placeholder consts (`const __pN = <walk>`) for `_mountSlot` placeholder
 * args + `replaceChild` targets — BEFORE phase 2 (`bindLines`) runs any
 * mutation. Once every DOM position is captured pre-mutation, phase-2 ops
 * are identity-based and order-independent w.r.t. sibling structure.
 *
 * These specs assert the ORDERING contract on the emitted code. The runtime
 * behavior locks live in
 * `packages/core/runtime-dom/src/tests/slot-before-sibling-refs.test.tsx`.
 */
import { transformJSX_JS } from '../jsx'

/** Index of the first occurrence of `needle`, asserting it exists. */
function idx(code: string, needle: string): number {
  const i = code.indexOf(needle)
  expect(i, `expected emitted code to contain \`${needle}\`\n\n${code}`).toBeGreaterThanOrEqual(0)
  return i
}

describe('template ref-hoist — refs captured BEFORE _mountSlot mutations (PZ-08)', () => {
  it('slot before a styled static sibling: __e0 walk + __p0 placeholder are hoisted above _mountSlot', () => {
    const src = `
import { signal } from '@pyreon/reactivity'
const banner = signal(false)
const styles = { card: { color: 'red' } }
export function App() {
  return <div>{banner() ? <b>on</b> : <span>off</span>}<div style={styles.card}>card content</div></div>
}
`
    const { code } = transformJSX_JS(src, 'test.tsx')
    // The placeholder arg is a hoisted const, not an inline walk.
    idx(code, 'const __p0 = __root.firstChild;')
    idx(code, '_mountSlot(() => (banner() ? ')
    expect(code).toContain('__root, __p0)')
    expect(code).not.toContain('_mountSlot(() => (banner() ? <b>on</b> : <span>off</span>), __root, __root.firstChild)')
    // The static sibling's ref walk is evaluated BEFORE the slot mounts.
    expect(idx(code, 'const __e0 = __root.firstChild.nextSibling;')).toBeLessThan(
      idx(code, '_mountSlot('),
    )
    expect(idx(code, 'const __p0 = ')).toBeLessThan(idx(code, '_mountSlot('))
    // The mutation still references the hoisted const.
    idx(code, '_setStyle(__e0, styles.card);')
  })

  it('two adjacent slots: BOTH placeholder walks are hoisted above the FIRST _mountSlot', () => {
    const src = `
import { signal } from '@pyreon/reactivity'
const loading = signal(true)
const items = signal([1])
export function App() {
  return <div>{loading() && <span class="spinner">spin</span>}{items().length && <span class="list">list</span>}<p>after</p></div>
}
`
    const { code } = transformJSX_JS(src, 'test.tsx')
    const p0 = idx(code, 'const __p0 = __root.firstChild;')
    const p1 = idx(code, 'const __p1 = __root.firstChild.nextSibling;')
    const firstSlot = idx(code, '_mountSlot(')
    // Both placeholders resolved against the PRISTINE clone, before either
    // slot mutates the child list.
    expect(p0).toBeLessThan(firstSlot)
    expect(p1).toBeLessThan(firstSlot)
    // Each slot consumes its own hoisted const.
    expect(code).toContain('__root, __p0)')
    expect(code).toContain('__root, __p1)')
    // The second slot's arg must NOT be an inline (stale) walk.
    expect(code).not.toContain('__root, __root.firstChild.nextSibling)')
  })

  it('falsy STATIC conditional before an attr-bearing sibling: sibling ref hoisted above _mountSlot', () => {
    const src = `
const show = false
export function App() {
  return <div>{show && <em>x</em>}<div id={"a" + "b"}>after</div></div>
}
`
    const { code } = transformJSX_JS(src, 'test.tsx')
    // Static slot value is passed bare; its placeholder is a hoisted const.
    idx(code, 'const __p0 = __root.firstChild;')
    idx(code, '_mountSlot(show && ')
    expect(idx(code, 'const __e0 = __root.firstChild.nextSibling;')).toBeLessThan(
      idx(code, '_mountSlot('),
    )
    idx(code, '__e0.setAttribute("id", "a" + "b");')
  })

  it('slot before a reactive-text sibling: element ref AND text capture hoisted above _mountSlot', () => {
    const src = `
import { signal } from '@pyreon/reactivity'
const zoom = signal(1)
const conds = signal(true)
export function App() {
  return <div>{conds() && <button>b</button>}<div>{zoom()}</div></div>
}
`
    const { code } = transformJSX_JS(src, 'test.tsx')
    const slot = idx(code, '_mountSlot(')
    expect(idx(code, 'const __e0 = __root.firstChild.nextSibling;')).toBeLessThan(slot)
    expect(idx(code, 'const __t1 = __e0.firstChild;')).toBeLessThan(slot)
    idx(code, 'const __d1 = _bindText(zoom, __t1);')
  })

  it('mixed-content reactive text after a slot: replaceChild target is a hoisted const', () => {
    const src = `
import { signal } from '@pyreon/reactivity'
const cond = signal(true)
const label = signal('x')
export function App() {
  return <div>{cond() && <em>x</em>} tail {label()}</div>
}
`
    const { code } = transformJSX_JS(src, 'test.tsx')
    const slot = idx(code, '_mountSlot(')
    // The reactive-text child's replaceChild target walk is captured in
    // phase 1 (against the pristine clone), not inlined after the slot ran.
    const p1 = idx(code, 'const __p1 = __root.firstChild.nextSibling.nextSibling;')
    expect(p1).toBeLessThan(slot)
    idx(code, '.replaceChild(__t0, __p1);')
    expect(code).not.toContain('replaceChild(__t0, __root.firstChild')
  })

  it('mixed-content STATIC text after a slot: replaceChild target is a hoisted const', () => {
    const src = `
import { signal } from '@pyreon/reactivity'
const cond = signal(true)
const title = "t"
export function App() {
  return <div>{cond() && <em>x</em>}<b>bold</b>{title}</div>
}
`
    const { code } = transformJSX_JS(src, 'test.tsx')
    const slot = idx(code, '_mountSlot(')
    const p1 = idx(code, 'const __p1 = __root.firstChild.nextSibling.nextSibling;')
    expect(p1).toBeLessThan(slot)
    idx(code, '_setChildAt(__root, __p1, title);')
  })

  it('slot-free templates are unchanged (no __p consts, no ordering churn)', () => {
    const src = `
import { signal } from '@pyreon/reactivity'
const count = signal(0)
export function App() {
  return <div><span class="a">x</span><b>{count()}</b></div>
}
`
    const { code } = transformJSX_JS(src, 'test.tsx')
    expect(code).not.toContain('__p0')
    idx(code, 'const __e0 = ')
    idx(code, '_bindText(count, __t1)')
  })
})
