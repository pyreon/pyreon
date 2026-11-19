/**
 * A reactive range re-rendered WHILE a sibling is mounting must stay removable.
 *
 * `<ul>{() => items()}<Writer/></ul>`: `Writer` writes `items` during its
 * setup. That runs the accessor's boundary again right then, inside the
 * `<ul>`'s children loop, where `mountChild` is in the element-depth window
 * (`_elementDepth > 0`: children leave with the element, so their cleanups are
 * no-ops). The boundary's run inherited that window, so everything it mounted
 * got no-op cleanups, and a later run that rendered nothing left the old nodes
 * in the document (2 stale `<li>` where 0 were rendered).
 *
 * The class is "a reactive boundary mounts from its effect, and removes what it
 * mounted itself": `mountReactive` (every `() => …` child, `<Show>`, a
 * component returning an accessor), the keyed `.map()` reconciler, the
 * polymorphic text core, `TransitionGroup` items and `KeepAlive` children. All
 * of them now mount through `mountOwned` (depth 0). `<For>` removes its rows by
 * range and is pinned here as a control.
 *
 * Bisect-verified against main's sources (mount.ts, hydrate.ts,
 * transition-group.ts, keep-alive.ts): the two accessor, the `<Show>` and the
 * two compiled specs fail with `expected 2 to be +0` / `expected 1 to be +0`;
 * the text-swap and `<For>`/keyed controls pass there too. TransitionGroup
 * needs real transition events: see `reactive-range-reentrant-render.browser.test.tsx`.
 */
import { transformJSX } from '@pyreon/compiler'
import { For, Fragment, h, Show, _lc, _rp, _rpd, cx } from '@pyreon/core'
import { _bind, renderEffect, signal } from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import { _applyProps, _bindProp, _setAttr, _setStyle, _setStyleOnce, bindPolymorphicText, mount, mountChild } from '../index'
import { _bindDirect, _bindText, _mountSlot, _setChild, _setChildAt, _textSlot, _tpl } from '../template'

const containers: HTMLElement[] = []
afterEach(() => {
  for (const c of containers.splice(0)) c.remove()
})
const host = (): HTMLElement => {
  const el = document.createElement('div')
  document.body.appendChild(el)
  containers.push(el)
  return el
}

describe('a reactive range re-rendered by a sibling that writes during setup (h() path)', () => {
  it('an accessor rendering an array: the later empty render removes every row', () => {
    const items = signal<string[]>(['a'])
    const Writer = () => {
      items.set(['a', 'b'])
      return h('i', null, 'w')
    }
    const el = host()
    const dispose = mount(h('ul', null, () => items().map((t) => h('li', null, t)), h(Writer, null)), el)
    expect(el.querySelectorAll('li').length).toBe(2)
    items.set([])
    expect(el.querySelectorAll('li').length).toBe(0)
    items.set(['c'])
    expect(el.querySelector('ul')!.textContent).toBe('cw')
    dispose()
    expect(el.innerHTML).toBe('')
  })

  it('an accessor rendering one element: the later null render removes it', () => {
    const n = signal(1)
    const Writer = () => {
      n.set(2)
      return null
    }
    const el = host()
    mount(h('div', null, () => (n() ? h('b', null, String(n())) : null), h(Writer, null)), el)
    expect(el.querySelector('b')!.textContent).toBe('2')
    n.set(0)
    expect(el.querySelectorAll('b').length).toBe(0)
  })

  it('<Show>: toggled on by a sibling setup, then off, leaves nothing', () => {
    const on = signal(false)
    const Writer = () => {
      on.set(true)
      return null
    }
    const el = host()
    mount(h('div', null, h(Show, { when: () => on() }, h('b', null, 'x')), h(Writer, null)), el)
    expect(el.querySelectorAll('b').length).toBe(1)
    on.set(false)
    expect(el.querySelectorAll('b').length).toBe(0)
  })

  it('the text-to-subtree swap: back to text removes the subtree', () => {
    const v = signal<unknown>('t')
    const Writer = () => {
      v.set(h('b', null, 'x'))
      return null
    }
    const el = host()
    mount(h('div', null, (() => v()) as never, h(Writer, null)), el)
    expect(el.querySelectorAll('b').length).toBe(1)
    v.set('t2')
    expect(el.querySelectorAll('b').length).toBe(0)
    expect(el.textContent).toBe('t2')
  })

  it('the keyed reconciler and <For> (controls): single-row removal after the re-entrant render', () => {
    const items = signal([{ id: 1 }])
    const Writer = () => {
      items.set([{ id: 1 }, { id: 2 }, { id: 3 }])
      return null
    }
    const keyed = host()
    mount(h('ul', null, () => items().map((r) => h('li', { key: r.id }, String(r.id))), h(Writer, null)), keyed)
    const rows = signal([{ id: 1 }])
    const RowWriter = () => {
      rows.set([{ id: 1 }, { id: 2 }, { id: 3 }])
      return null
    }
    const forHost = host()
    mount(
      h(
        'ul',
        null,
        h(For as never, { each: rows, by: (r: { id: number }) => r.id }, ((r: { id: number }) => h('li', null, String(r.id))) as never),
        h(RowWriter, null),
      ),
      forHost,
    )
    items.set([{ id: 1 }, { id: 3 }])
    rows.set([{ id: 1 }, { id: 3 }])
    expect(keyed.textContent).toBe('13')
    expect(forHost.textContent).toBe('13')
  })
})

// ─── compiled path (real transformJSX) ─────────────────────────────────────────

const RUNTIME_DEPS = {
  _tpl,
  _bind,
  renderEffect,
  _bindText,
  _bindProp,
  _bindDirect,
  _applyProps,
  _setStyle,
  _setStyleOnce,
  _setAttr,
  _mountSlot,
  _textSlot,
  _setChild,
  _setChildAt,
  bindPolymorphicText,
  _rp,
  _rpd,
  _lc,
  _cx: cx,
  h,
  Fragment,
  document,
} as const
const lower = (code: string) =>
  transformSync(code, { loader: 'tsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment' }).code

function compileAndMount(source: string, globals: Record<string, unknown>): { el: HTMLElement; code: string } {
  const { code } = transformJSX(source, 'test.tsx')
  const body = lower(code.replace(/^import\s+.*$/gm, '').replace(/^export\s+/gm, ''))
  const fn = new Function(...Object.keys(RUNTIME_DEPS), ...Object.keys(globals), `${body}\nreturn App`)
  const App = fn(...Object.values(RUNTIME_DEPS), ...Object.values(globals)) as () => unknown
  const el = host()
  mountChild(h(App as never, null), el)
  return { el, code }
}

describe('the same shapes through the real compiler', () => {
  it('a compiled template: accessor hole, then a component that writes during setup', () => {
    const items = signal<string[]>(['a'])
    const { el, code } = compileAndMount(
      `function Writer() { items.set(['a', 'b']); return <i>w</i> }
       function App() { return <ul>{() => items().map((t) => <li>{t}</li>)}<Writer /></ul> }`,
      { items },
    )
    // Premise: the template really holds the accessor and mounts the component in its bind.
    expect(code).toContain('_tpl(')
    expect(el.querySelectorAll('li').length).toBe(2)
    items.set([])
    expect(el.querySelectorAll('li').length).toBe(0)
  })

  it('a compiled <Show> next to a component that writes its condition during setup', () => {
    const on = signal(false)
    const { el } = compileAndMount(
      `function Writer() { on.set(true); return null }
       function App() { return <div><Show when={() => on()}><b>x</b></Show><Writer /></div> }`,
      { on, Show },
    )
    expect(el.querySelectorAll('b').length).toBe(1)
    on.set(false)
    expect(el.querySelectorAll('b').length).toBe(0)
  })
})
