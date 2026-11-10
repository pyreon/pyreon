/**
 * Static-prop fold, behaviour through the REAL compiler (both backends emit it
 * identically — see compiler `static-prop-fold-emit.test.ts`). Inside a
 * capitalized component, `<Child depth={props.depth - 1} />` evaluates once
 * when `props.depth` is a primitive data property and keeps the `_rp` thunk
 * otherwise; `<Child x={props.x} />` forwards the parent's getter (or value).
 * Every spec asserts that a prop which reads a signal stays live.
 */
import { transformJSX } from '@pyreon/compiler'
import { Fragment, h, _fuse, _pk, _pp, _rp, _rpd } from '@pyreon/core'
import { _bind, createStore, renderEffect, signal } from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { _applyProps, _bindProp, _bindText, _mountChild, _mountSlot, _setAttr, _setChild, _tpl, mount } from '../index'
import { bindPolymorphicText } from '../mount'

const DEPS = {
  _tpl, _bind, renderEffect, _bindText, _bindProp, _applyProps, _setAttr, _mountSlot, _mountChild, _setChild,
  bindPolymorphicText, _fuse, _pk, _pp, _rp, _rpd, h, Fragment, signal,
}
function compile(source: string, globals: Record<string, unknown> = {}): () => unknown {
  const { code } = transformJSX(source, 'test.tsx', { templatizeComponentChildren: true } as never)
  const body = transformSync(code.replace(/^import\s+.*$/gm, '').replace(/^export\s+/gm, ''), {
    loader: 'tsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment',
  }).code
  const names = [...Object.keys(DEPS), ...Object.keys(globals)]
  return new Function(...names, `${body}\nreturn App`)(...Object.values(DEPS), ...Object.values(globals)) as () => unknown
}
function render(App: () => unknown): { host: HTMLElement; unmount: () => void } {
  const host = document.createElement('div')
  const unmount = mount(h(App as never, null), host)
  return { host, unmount }
}

const TREE = `
  function Node(props) {
    seen.push(props)
    if (props.depth <= 1) return <b>{props.depth}:{props.tag}</b>
    return <div class="n"><Node depth={props.depth - 1} tag={props.tag} /></div>
  }
`

describe('static-prop fold', () => {
  it('a literal root folds every level to plain data props', () => {
    const seen: object[] = []
    const App = compile(TREE + `const App = () => <Node depth={4} tag="t" />`, { seen })
    const { host, unmount } = render(App)
    expect(host.querySelector('b')!.textContent).toBe('1:t')
    expect(seen).toHaveLength(4)
    for (const p of seen) {
      expect(Object.getOwnPropertyDescriptor(p, 'depth')!.get).toBeUndefined()
      expect(Object.getOwnPropertyDescriptor(p, 'tag')!.get).toBeUndefined()
    }
    unmount()
  })

  it('a signal root keeps the whole chain live, and the pass-through forwards ONE getter', () => {
    const seen: object[] = []
    const S: { d?: ReturnType<typeof signal<number>>; t?: ReturnType<typeof signal<string>> } = {}
    const App = compile(
      TREE + `const d = signal(3); const t = signal('a'); S.d = d; S.t = t
      const App = () => <Node depth={d()} tag={t()} />`,
      { seen, S },
    )
    const { host, unmount } = render(App)
    expect(host.querySelectorAll('b')).toHaveLength(1)
    expect(host.querySelector('b')!.textContent).toBe('1:a')
    // `tag` is forwarded: every level installs the root's own `_rpd` thunk.
    const getters = seen.map((p) => Object.getOwnPropertyDescriptor(p, 'tag')!.get)
    expect(new Set(getters).size).toBe(1)
    expect(typeof (getters[0] as { direct?: unknown }).direct).toBe('function')
    S.t!.set('b')
    expect(host.querySelector('b')!.textContent).toBe('1:b')
    // `depth` cannot fold under a getter, so it stays a live thunk per level.
    expect(Object.getOwnPropertyDescriptor(seen[2]!, 'depth')!.get).toBeTypeOf('function')
    // The leaf's `{props.depth}` reads root depth − 2 through the live chain.
    S.d!.set(7)
    expect(host.querySelector('b')!.textContent).toBe('5:b')
    unmount()
  })

  it('a lowercase helper over a store item is NOT folded (a proxy reports data descriptors)', () => {
    const store = createStore({ item: { label: 'x' } })
    const App = compile(
      `const Label = (props) => <i>{props.text}</i>
       const row = (item) => <Label text={item.label + '!'} />
       const App = () => row(store.item)`,
      { store },
    )
    const { host, unmount } = render(App)
    const i = host.querySelector('i')!
    expect(i.textContent).toBe('x!')
    store.item.label = 'y'
    expect(host.querySelector('i')).toBe(i)
    expect(i.textContent).toBe('y!')
    unmount()
  })

  it('a re-bound props name disables the fold for that component', () => {
    const s = signal('p')
    const App = compile(
      `const Label = (props) => <i>{props.text}</i>
       function Wrap(props) { if (props.alt) props = props.alt; return <Label text={props.text + '.'} /> }
       const App = () => <Wrap text="a" alt={{ get text() { return s() } }} />`,
      { s },
    )
    const { host, unmount } = render(App)
    expect(host.querySelector('i')!.textContent).toBe('p.')
    s.set('q')
    expect(host.querySelector('i')!.textContent).toBe('q.')
    unmount()
  })
})
