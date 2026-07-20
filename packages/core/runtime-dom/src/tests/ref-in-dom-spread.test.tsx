/**
 * Regression: a `ref` inside a spread on a BARE DOM element must be wired on
 * the COMPILED template path, not only the h() path.
 *
 * The compiler lowers `<div {...props}>` (bare element) to
 * `_tpl(html, __root => { _applyProps(__root, props) })`. `applyProps` skips
 * `ref` (not a DOM attribute) and the h()/hydrate paths wire it separately in
 * `mountElement`/`hydrateElement` — but the template path had no companion
 * step, so a spread `ref` was SILENTLY DROPPED while every h()-path unit test
 * passed. Real-world hits (0.49 audit): `@pyreon/ui-primitives` CalendarBase's
 * `getDayProps()` returns `{ ref }` feeding its focus registry (roving focus
 * dead in the compiled ui-showcase), and SpoilerBase spreads `useElementSize`'s
 * ref (measured height stuck at 0 → the toggle never appears).
 *
 * Fix: the exported `_applyProps` is `applyPropsWithRef` — `applyProps` + wire
 * the spread's `ref`. Compiled through the REAL transform here (vitest's own
 * JSX transform would mask it — the documented wrong-transform trap).
 *
 * Bisect (documented in the PR): re-point `_applyProps` back to the plain
 * `applyProps as _applyProps` alias in index.ts → "spread ref fires" fails
 * (`expected null not to be null`); restore → green.
 */
import { transformJSX } from '@pyreon/compiler'
import { transformSync } from 'esbuild'
import { Fragment, h, _rp, cx, makeReactiveProps } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { _tpl, _bindText, _bindDirect, _mountSlot, _setChild, _setChildAt } from '../template'
import { _applyProps, _bindSpread, _setAttr, _setStyle, bindPolymorphicText, mount, mountChild } from '../index'

const RUNTIME_DEPS = {
  _tpl, _bind, _bindText, _bindDirect, _applyProps, _bindSpread, _setStyle, _setAttr,
  _mountSlot, _setChild, _setChildAt, bindPolymorphicText, _rp, _cx: cx,
  h, Fragment, signal, document,
} as const
const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)

function compileApp(source: string, globals: Record<string, unknown>): () => unknown {
  const { code } = transformJSX(source, 'test.tsx')
  const stripped = code.replace(/^import\s+.*$/gm, '').replace(/^export\s+/gm, '').trim()
  const body = transformSync(stripped, { loader: 'tsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment' }).code
  return new Function(...DEP_NAMES, ...Object.keys(globals), `${body}\nreturn App`)(
    ...DEP_VALUES, ...Object.values(globals),
  ) as () => unknown
}

describe('#ref-in-dom-spread — spread ref on a bare element is wired (compiled)', () => {
  it('fires the spread ref with the element on the compiled template path', () => {
    let got: Element | null = null
    // `props` carries a `ref` — exactly the getDayProps()/useElementSize shape.
    const makeProps = () => ({ 'data-x': '1', ref: (el: Element | null) => { got = el } })
    const App = compileApp(
      `const App = () => <div {...makeProps()} class="cell">hi</div>`,
      { makeProps },
    )
    const container = document.createElement('div')
    document.body.appendChild(container)
    const cleanup = mountChild(h(App as never, null), container) ?? (() => {})
    try {
      // THE assertion — pre-fix `got` stayed null (ref dropped by _applyProps).
      expect(got, 'spread ref must fire on the compiled path').not.toBeNull()
      expect((got as unknown as Element).getAttribute('data-x')).toBe('1')
      // the element is the rendered cell (attributes still applied)
      expect(container.querySelector('.cell')).toBe(got)
    } finally {
      cleanup()
      container.remove()
    }
  })

  it('a spread WITHOUT a ref still mounts cleanly (no behavior change)', () => {
    const App = compileApp(`const App = () => <div {...p} class="plain">x</div>`, {
      p: { id: 'plain-1', title: 't' },
    })
    const container = document.createElement('div')
    mount(h(App as never, null), container)
    const el = container.querySelector('.plain')!
    expect(el.getAttribute('id')).toBe('plain-1')
    expect(el.getAttribute('title')).toBe('t')
  })

  // "Spread out of the box": the compiled template path must thread the
  // `_applyProps` cleanup into the mount lifecycle, so a spread's reactive
  // props AND its ref are torn down on unmount — not leaked. Pre-fix the
  // bindFn `return null`ed (identifier spread) / discarded the inner cleanup
  // (call spread). Both paths asserted here.
  it('IDENTIFIER spread — reactive props update AND dispose, ref fires AND nulls on unmount', () => {
    const title = signal('A')
    let refEl: Element | null = 'unset' as never
    const props = makeReactiveProps({
      id: 'idk',
      title: _rp(() => title()),
      ref: (el: Element | null) => {
        refEl = el
      },
    })
    const App = compileApp(`const App = () => <div {...props}>x</div>`, { props })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const cleanup = mountChild(h(App as never, null), container)!
    const el = container.querySelector('#idk')!
    expect(refEl, 'ref fires with element').toBe(el)
    expect(el.getAttribute('title'), 'reactive prop initial').toBe('A')
    title.set('B')
    expect(el.getAttribute('title'), 'reactive prop updates through spread').toBe('B')
    cleanup()
    expect(refEl, 'ref NULLED on unmount (was leaked pre-fix)').toBeNull()
    title.set('C')
    expect(el.getAttribute('title'), 'reactive binding DISPOSED on unmount (stays B)').toBe('B')
    container.remove()
  })

  it('CALL spread — _bindSpread disposes the per-run bindings + ref on unmount', () => {
    const label = signal('x')
    let refEl: Element | null = 'unset' as never
    // A call spread (`{...make()}`) routes through the reactive `_bind` +
    // `onCleanup` path — distinct codegen from the identifier spread.
    const make = () => makeReactiveProps({
      'data-label': _rp(() => label()),
      ref: (el: Element | null) => {
        refEl = el
      },
    })
    const App = compileApp(`const App = () => <div {...make()} class="cs">x</div>`, { make })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const cleanup = mountChild(h(App as never, null), container)!
    const el = container.querySelector('.cs')!
    expect(refEl, 'call-spread ref fires').toBe(el)
    expect(el.getAttribute('data-label')).toBe('x')
    cleanup()
    expect(refEl, 'call-spread ref nulled on unmount').toBeNull()
    container.remove()
  })
})
