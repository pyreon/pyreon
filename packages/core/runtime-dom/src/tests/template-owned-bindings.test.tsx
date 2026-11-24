/**
 * Template-owned bindings: a binding built by a compiled template (or a
 * runtime-dom mount helper) is owned by the cleanup it is returned to, and no
 * longer ALSO by the component's `EffectScope`. That second owner kept a
 * `[dispose]` array alive per component; dropping it must not orphan a binding
 * on any path. Each test below names the path it pins, and compiles through
 * the real `transformJSX` so the emitted shape is the shipped one.
 */
import { For, h } from '@pyreon/core'
import { type EffectScope, getCurrentScope, signal } from '@pyreon/reactivity'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { hydrateRoot } from '../hydrate'
import { compilePlainModule, mountComponent } from './plain-harness'

const subs = (s: { debug(): { subscriberCount: number } }) => s.debug().subscriberCount

let errSpy: ReturnType<typeof vi.spyOn> | null = null

afterEach(() => {
  errSpy?.mockRestore()
  errSpy = null
  document.body.innerHTML = ''
})

const quietErrors = () => {
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
}

describe('a component whose bindings are all in its template', () => {
  it('leaves its scope empty, and unmount still disposes every binding', () => {
    const t = signal('x')
    const on = signal(true)
    const a = signal('A')
    const b = signal('B')
    const scopes: (EffectScope | null)[] = []
    const { exports } = compilePlainModule<{ Leaf: () => unknown }>(
      `export function Leaf() {
        scopes.push(getCurrentScope())
        return <p title={t()}>{t() + '!'}</p>
      }`,
      ['Leaf'],
      { t, on, a, b, scopes, getCurrentScope },
    )
    const { container, cleanup } = mountComponent(exports.Leaf)
    expect(container.innerHTML).toBe('<p title="x">x!</p>')
    // The tracked text binding (`bindPolymorphicText`) did not register with
    // the component's scope: the template cleanup is its only owner.
    expect(scopes[0]!._isEmpty()).toBe(true)
    expect(subs(t)).toBeGreaterThan(0)
    t.set('y')
    expect(container.innerHTML).toBe('<p title="y">y!</p>')
    cleanup()
    expect(subs(t)).toBe(0)
  })

  it('a binding built after a child component mounts is disposed on unmount', () => {
    const a = signal(1)
    const { exports } = compilePlainModule<{ Parent: () => unknown }>(
      `function Child() { return <i>c</i> }
       export function Parent() { return <div><Child /><b>{a() + 1}</b></div> }`,
      ['Parent'],
      { a },
    )
    const { container, cleanup } = mountComponent(exports.Parent)
    expect(container.textContent).toBe('c2')
    expect(subs(a)).toBe(1)
    cleanup()
    expect(subs(a)).toBe(0)
  })
})

describe('error paths: nothing receives the cleanup, so the owner frame disposes', () => {
  it('a setup that throws inside its template bind disposes the bindings built before the throw', () => {
    quietErrors()
    const a = signal(1)
    const boom = () => {
      throw new Error('boom')
    }
    const { exports } = compilePlainModule<{ Throws: () => unknown }>(
      `export function Throws() { return <div><b>{a() + 1}</b><i>{boom()}</i></div> }`,
      ['Throws'],
      { a, boom },
    )
    const { container } = mountComponent(exports.Throws)
    expect(container.querySelector('b')).toBeNull()
    expect(subs(a)).toBe(0)
  })

  it('a render that throws after the template was built disposes its bindings', () => {
    quietErrors()
    const a = signal(1)
    const boom = () => {
      throw new Error('boom')
    }
    const { exports } = compilePlainModule<{ RenderThrows: () => unknown }>(
      `export function RenderThrows() { return <><b>{a() + 1}</b>{boom}</> }`,
      ['RenderThrows'],
      { a, boom },
    )
    mountComponent(exports.RenderThrows)
    expect(subs(a)).toBe(0)
  })

  it('a <For> row callback that throws disposes the row bindings built before the throw', () => {
    quietErrors()
    const sel = signal(0)
    const boom = () => {
      throw new Error('row boom')
    }
    const { exports } = compilePlainModule<{ Row: (r: { id: number }) => unknown }>(
      `export function Row(r) { return <li><b>{sel() + r.id}</b><i>{r.id === 2 ? boom() : r.id}</i></li> }`,
      ['Row'],
      { sel, boom },
    )
    const rows = signal([{ id: 1 }, { id: 2 }])
    // <For>'s effect reports the row's error rather than propagating it.
    const { cleanup } = mountComponent(() =>
      h(For as never, {
        each: rows,
        by: (r: { id: number }) => r.id,
        children: (r: { id: number }) => exports.Row(r),
      }),
    )
    // Row 2 built its first text binding, then its second threw: the row
    // frame disposed the first. Only row 1's binding on `sel` is live.
    expect(subs(sel)).toBe(1)
    cleanup()
    expect(subs(sel)).toBe(0)
  })
})

describe('hydration error path', () => {
  it('a setup that throws inside its adopting template bind disposes the bindings built before the throw', () => {
    quietErrors()
    const a = signal(1)
    const boom = () => {
      throw new Error('boom')
    }
    const { exports } = compilePlainModule<{ Throws: () => unknown }>(
      `export function Throws() { return <div><b>{a() + 1}</b><i>{boom()}</i></div> }`,
      ['Throws'],
      { a, boom },
    )
    const host = document.createElement('div')
    document.body.appendChild(host)
    host.innerHTML = '<div><b>2</b><i>x</i></div>'
    hydrateRoot(host, h(exports.Throws as never, null))
    expect(subs(a)).toBe(0)
  })
})

describe('<For> rows with an attribute binding', () => {
  it('removing rows and unmounting the list disposes every row binding', () => {
    const sel = signal(0)
    const { exports } = compilePlainModule<{ Row: (r: { id: number }) => unknown }>(
      `export function Row(r) { return <li class={sel() === r.id ? 'on' : ''}>{r.id}</li> }`,
      ['Row'],
      { sel },
    )
    const rows = signal(Array.from({ length: 50 }, (_, i) => ({ id: i })))
    const { container, cleanup } = mountComponent(() =>
      h(For as never, {
        each: rows,
        by: (r: { id: number }) => r.id,
        children: (r: { id: number }) => exports.Row(r),
      }),
    )
    expect(container.querySelectorAll('li').length).toBe(50)
    const live = subs(sel)
    expect(live).toBe(50)
    rows.set(rows().slice(25))
    expect(subs(sel)).toBe(25)
    sel.set(30)
    expect(container.querySelector('li.on')?.textContent).toBe('30')
    cleanup()
    expect(subs(sel)).toBe(0)
  })
})

describe('an accessor mounted by `_setChild` (a statement, no cleanup returned)', () => {
  it('is disposed with its component through the scope', () => {
    const n = signal(1)
    const label = () => n()
    const { exports } = compilePlainModule<{ App: () => unknown }>(
      `export function App() { return <p>{label}</p> }`,
      ['App'],
      { label },
    )
    const { container, cleanup } = mountComponent(exports.App)
    expect(container.textContent).toBe('1')
    expect(subs(n)).toBe(1)
    cleanup()
    expect(subs(n)).toBe(0)
  })
})

// Keeps the import list honest for the owner-scope probe above.
void getCurrentScope
