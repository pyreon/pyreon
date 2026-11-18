/**
 * #4390: the ref contract on the compiled `_tpl` path, for every ref form.
 *
 * A ref fires ONCE at mount with an element owned by the PAGE document (so
 * `ownerDocument.defaultView` is the window, as for an h()-built element), and
 * receives `null` on unmount. Before the fix a compiled ref fired on a clone
 * owned by the template's inert document (`defaultView === null`), which
 * `@pyreon/virtual` read as "no window" and never observed scroll; and the
 * compiled bind never handed a ref `null`, so a callback ref never saw the
 * unmount and an object ref kept the detached element.
 *
 * Compiled through the REAL `transformJSX`; vitest's JSX transform never emits
 * `_tpl`. The happy-dom document model is checked here as far as it goes; the
 * `.browser` twin is the evidence for real ownership.
 */
import { transformJSX } from '@pyreon/compiler'
import * as core from '@pyreon/core'
import { For, Fragment, createRef, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { describe, expect, it } from 'vitest'
import * as dom from '../index'

const DEPS: Record<string, unknown> = {
  ...Object.fromEntries(Object.entries(dom).filter(([k]) => k.startsWith('_'))),
  ...Object.fromEntries(Object.entries(core).filter(([k]) => k.startsWith('_'))),
  h,
  Fragment,
  For,
}

function compile(src: string, scope: Record<string, unknown>): { App: () => unknown; code: string } {
  const { code } = transformJSX(src, 'case.tsx')
  const body = transformSync(code.replace(/^import[^\n]*\n/gm, ''), {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
  const deps = { ...DEPS, ...scope }
  const App = new Function(...Object.keys(deps), `${body}\nreturn App`)(...Object.values(deps)) as () => unknown

  return { App, code }
}

type Seen = (Element | null)[]

const CASES: { name: string; src: string; expectCount: number }[] = [
  { name: 'callback ref on the template root', src: 'const App = () => <div ref={(el) => seen.push(el)}><span>x</span></div>', expectCount: 1 },
  { name: 'callback ref on a nested element', src: 'const App = () => <div><span ref={(el) => seen.push(el)}>x</span></div>', expectCount: 1 },
  { name: 'a ref value (callback through a binding)', src: 'const App = () => <div><span ref={cb}>x</span></div>', expectCount: 1 },
  { name: 'signal .set wrapper', src: 'const App = () => <div><span ref={(el) => sig.set(el)}>x</span></div>', expectCount: 1 },
  {
    name: 'ref after a slot',
    src: 'const App = () => <div>{items().map((i) => <b>{i}</b>)}<span ref={cb}>x</span></div>',
    expectCount: 1,
  },
  {
    name: 'ref inside <For> rows',
    src: 'const App = () => <ul><For each={rows} by={(x) => x}>{(x) => <li ref={cb}>{x}</li>}</For></ul>',
    expectCount: 2,
  },
]

describe('compiled refs follow the h() ref contract (#4390)', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const seen: Seen = []
      const sig = signal<Element | null>(null)
      const cb = (el: Element | null) => seen.push(el)
      const items = signal([1, 2])
      const { App, code } = compile(c.src, { seen, sig, cb, items, rows: [1, 2] })
      expect(code).toContain('_ref(')
      const host = document.createElement('div')
      document.body.appendChild(host)
      const dispose = dom.mount(h(App as never, null), host)
      const fired = c.src.includes('sig.set') ? [sig()] : seen.slice()
      expect(fired.length).toBe(c.expectCount)
      for (const el of fired) {
        expect(el).toBeInstanceOf(Element)
        expect((el as Element).ownerDocument).toBe(document)
        expect(host.contains(el as Element)).toBe(true)
      }
      dispose()
      if (c.src.includes('sig.set')) {
        expect(sig()).toBeNull()
      } else {
        expect(seen.slice(c.expectCount)).toEqual(new Array(c.expectCount).fill(null))
      }
      host.remove()
    })
  }

  it('an object ref is set at mount and cleared on unmount', () => {
    const r = createRef<HTMLElement>()
    const { App } = compile('const App = () => <div><span ref={r}>x</span></div>', { r })
    const host = document.createElement('div')
    const dispose = dom.mount(h(App as never, null), host)
    expect(r.current?.tagName).toBe('SPAN')
    expect(r.current?.ownerDocument).toBe(document)
    dispose()
    expect(r.current).toBeNull()
  })

  it('a null/undefined ref is ignored', () => {
    const { App } = compile('const App = () => <div><span ref={r}>x</span></div>', { r: undefined })
    const host = document.createElement('div')
    const dispose = dom.mount(h(App as never, null), host)
    expect(host.querySelector('span')).not.toBeNull()
    dispose()
  })
})
