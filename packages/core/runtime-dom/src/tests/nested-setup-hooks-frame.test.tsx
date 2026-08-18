/**
 * A NESTED component setup must not close its parent's lifecycle-hook frame.
 *
 * `runWithHooks` used to open the frame with `setCurrentHooks(hooks)` and close
 * it with `setCurrentHooks(null)` — a reset to a CONSTANT rather than a restore
 * of the caller's frame. That is only correct at depth 1, and component setup
 * genuinely nests: the compiler lowers an element with a conditional/`.map`
 * child to `_tpl(html, bindFn)` where `bindFn` calls `_mountSlot(...)`, and
 * `_tpl` runs `bindFn` SYNCHRONOUSLY at its call site. So
 *
 *     const box = <div>{props.show && <Child />}</div>   // ← Child mounts HERE
 *     onMount(() => { ... })                             // ← frame already closed
 *
 * mounts `Child` (a full `runWithHooks`) partway through `Parent`'s own setup.
 * On the inner frame's exit `_current` went to null, so every hook `Parent`
 * registered afterwards was DROPPED — silently, except for a dev warning that
 * blames the user for calling a hook "outside component setup".
 *
 * Third instance of the reset-vs-restore class already catalogued in
 * `.claude/rules/anti-patterns.md` (the reactivity cleanup collector and deps
 * collector were the first two).
 *
 * These specs compile REAL source through `transformJSX` — the emit is the
 * whole point (vitest's own JSX transform never produces `_tpl`/`_mountSlot`,
 * so it cannot reproduce the nesting at all).
 */
import { transformJSX } from '@pyreon/compiler'
import { Fragment, h, onMount, onUnmount, _rp, cx } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, test } from 'vitest'
import { _applyProps, _setAttr, _setStyle, bindPolymorphicText, mountChild } from '../index'
import { _bindDirect, _bindText, _mountSlot, _setChild, _setChildAt, _tpl } from '../template'

const RUNTIME_DEPS = {
  _tpl,
  _bind,
  _bindText,
  _bindDirect,
  _applyProps,
  _setStyle,
  _setAttr,
  _mountSlot,
  _setChild,
  _setChildAt,
  bindPolymorphicText,
  _rp,
  _cx: cx,
  h,
  Fragment,
  signal,
  document,
} as const
const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)

const stripImports = (code: string) => code.replace(/^import\s+.*$/gm, '').trim()
const lower = (code: string) =>
  transformSync(code, { loader: 'tsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment' })
    .code

/** Compile SOURCE (must define `App`) with the real transform and mount it. */
function compileAndMount(
  source: string,
  globals: Record<string, unknown>,
): { container: HTMLDivElement; cleanup: () => void; code: string } {
  const { code } = transformJSX(source, 'test.tsx')
  const body = lower(stripImports(code).replace(/^export\s+/gm, ''))
  const fn = new Function(...DEP_NAMES, ...Object.keys(globals), `${body}\nreturn App`)
  const App = fn(...DEP_VALUES, ...Object.values(globals)) as () => unknown
  const container = document.createElement('div')
  document.body.appendChild(container)
  const cleanup = mountChild(h(App as never, null), container) ?? (() => {})
  return { container, cleanup, code }
}

const mounted: (() => void)[] = []
afterEach(() => {
  for (const c of mounted.splice(0)) c()
  document.body.innerHTML = ''
})

describe('nested component setup — hooks frame', () => {
  test('the compiler really does mount a child DURING the parent setup', () => {
    // Guards the premise. If a compiler change stops emitting `_mountSlot`
    // inside `_tpl` for this shape, the specs below would still pass while no
    // longer testing nesting at all — a regression test that quietly stops
    // reproducing its bug is worse than no test.
    const { code } = transformJSX(
      `function App(props: { show: boolean }) {
         const box = <div class="w">{props.show && <Child />}</div>
         return box
       }`,
      'test.tsx',
    )
    expect(code).toContain('_tpl(')
    expect(code).toContain('_mountSlot(')
  })

  test("a parent's onMount survives a child mounting mid-setup", () => {
    const order: string[] = []
    const source = `
      function Child() {
        onMount(() => { order.push('child-mount') })
        return <span class="c">c</span>
      }
      function App() {
        // _tpl runs its bind fn — and therefore _mountSlot → Child's full
        // runWithHooks — right here, BEFORE the onMount below.
        const box = <div class="w">{show && <Child />}</div>
        onMount(() => { order.push('parent-mount') })
        onUnmount(() => { order.push('parent-unmount') })
        return box
      }`
    const { container, cleanup } = compileAndMount(source, {
      onMount,
      onUnmount,
      order,
      show: true,
    })
    mounted.push(cleanup)

    expect(container.querySelector('.c')).not.toBeNull()
    // Pre-fix: 'parent-mount' was ABSENT — the child's frame exit reset
    // `_current` to null, so the parent's onMount hit the no-frame path.
    expect(order).toContain('child-mount')
    expect(order).toContain('parent-mount')

    cleanup()
    mounted.length = 0
    expect(order).toContain('parent-unmount')
  })

  test('the child still gets its OWN hooks, not the parent’s', () => {
    const order: string[] = []
    const source = `
      function Child() {
        onUnmount(() => { order.push('child-unmount') })
        return <span class="c">c</span>
      }
      function App() {
        const box = <div class="w">{show && <Child />}</div>
        onUnmount(() => { order.push('parent-unmount') })
        return box
      }`
    const { cleanup } = compileAndMount(source, { onMount, onUnmount, order, show: true })
    cleanup()
    // Both fire, and the child's fires first (inner subtree tears down before
    // the parent's own unmount hooks) — proving the frames stayed distinct
    // rather than the parent's hook landing on the child.
    expect(order).toEqual(['child-unmount', 'parent-unmount'])
  })

  test('a child that mounts nothing (falsy branch) leaves the parent frame open', () => {
    const order: string[] = []
    const source = `
      function Child() { return <span class="c">c</span> }
      function App() {
        const box = <div class="w">{show && <Child />}</div>
        onMount(() => { order.push('parent-mount') })
        return box
      }`
    const { container, cleanup } = compileAndMount(source, {
      onMount,
      onUnmount,
      order,
      show: false,
    })
    mounted.push(cleanup)
    expect(container.querySelector('.c')).toBeNull()
    expect(order).toEqual(['parent-mount'])
  })

  test('TWO children mounted mid-setup still leave the parent frame open', () => {
    const order: string[] = []
    const source = `
      function Child() {
        onMount(() => { order.push('child-mount') })
        return <span class="c">c</span>
      }
      function App() {
        const a = <div class="a">{show && <Child />}</div>
        const b = <div class="b">{show && <Child />}</div>
        onMount(() => { order.push('parent-mount') })
        return <div class="w">{a}{b}</div>
      }`
    const { cleanup } = compileAndMount(source, { onMount, onUnmount, order, show: true })
    mounted.push(cleanup)
    expect(order.filter((o) => o === 'child-mount')).toHaveLength(2)
    expect(order).toContain('parent-mount')
  })
})
