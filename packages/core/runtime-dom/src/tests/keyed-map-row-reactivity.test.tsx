/**
 * A signal read inside a keyed `.map()` row must update THAT row.
 *
 * A keyed list keeps the row it already mounted for an unchanged key; the new
 * vnode a re-run builds for that key is dropped (`mountKeyedList` is `<For>`'s
 * reconciler, and a `<For>` row callback runs once per key too). So a value the
 * row reads EAGERLY while the list is built is captured once, and only an
 * accessor in the row (`{() => row.label()}`, `class={() => …}`, a component's
 * `_rp` prop) stays live. That is the runtime contract for hand-written `h()`,
 * locked below, and it is the same contract `<For>` has.
 *
 * Compiled JSX is supposed to produce those accessors by itself: the compiler
 * makes `{row.label()}` reactive wherever JSX appears. It did not when the JSX
 * sat inside a SLICED expression — source text the emit copied into a
 * generated accessor without walking it:
 *
 *  - the `_mountSlot(() => (…))` hole of a compiled template (`<ul>{rows().map(…)}</ul>`),
 *    walked with templates since #4705;
 *  - the same hole in SVG/MathML content (`<svg>{rows().map(…)}</svg>`), which
 *    #4705 left a slice because a `_tpl` root is namespaced by its own tag;
 *  - the `() => (…)` an h()-path child gets (`<Comp>{rows().map(…)}</Comp>`, and
 *    the inner `.map` of a keyed row, which stays on the h() path);
 *  - the `_rp(() => …)` of a component prop (`<List items={rows().map(…)} />`).
 *
 * The read then ran in the LIST's accessor: the list re-ran, the reconciler kept
 * the row for the unchanged key, and the cell stayed stale. The last three are
 * now walked with their JSX kept on the h() path (`wrapWalked` / `wrap_walked`,
 * and `hPathHoles` / `h_path_holes` for the foreign hole), so those rows bind
 * their own reads. Real compiler, both backends.
 */
import { createRequire } from 'node:module'
import { transformJSX_JS } from '@pyreon/compiler'
import * as core from '@pyreon/core'
import * as reactivity from '@pyreon/reactivity'
import { signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as dom from '../index'
import * as template from '../template'

type Backend = (source: string, ssr: boolean) => string

const backends: [string, Backend][] = [
  ['JavaScript', (source, ssr) => transformJSX_JS(source, 'rows.tsx', { ssr }).code],
]

try {
  const native = createRequire(import.meta.url)('../../../compiler/native/pyreon-compiler.node') as {
    transformJsx: (source: string, filename: string, ssr: boolean, known: null) => { code: string }
  }
  backends.push(['Rust', (source, ssr) => native.transformJsx(source, 'rows.tsx', ssr, null).code])
} catch {
  // The JavaScript backend runs without the optional addon; Rust runs when built.
}

const IDENT = /^[A-Za-z_$][\w$]*$/
const RUNTIME: Record<string, unknown> = {}

for (const ns of [reactivity, core, template, dom] as Record<string, unknown>[]) {
  for (const [k, v] of Object.entries(ns)) if (IDENT.test(k)) RUNTIME[k] = v
}

function load(compile: Backend, src: string, ext: Record<string, unknown>, ssr = false) {
  const body = transformSync(compile(src, ssr).replace(/^import\s.*$/gm, ''), {
    loader: 'tsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
  const scope = { ...RUNTIME, ...ext }

  return new Function(...Object.keys(scope), `${body}\nreturn App`)(...Object.values(scope)) as (p: unknown) => unknown
}

const mounted: (() => void)[] = []

afterEach(() => {
  for (const c of mounted.splice(0)) c()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function mountApp(App: (p: unknown) => unknown): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const unmount = dom.mount(core.h(App as never, null), container)
  mounted.push(() => {
    unmount()
    container.remove()
  })

  return container
}

const mk = (id: number) => ({
  id,
  label: signal(`L${id}`),
  cls: signal('a'),
  kids: signal([{ id: id * 10 }]),
})

/** Passes its children through, so the `.map` is an h()-path child of a component. */
const Comp = (p: { children?: unknown }) => p.children as never
/** Renders a list handed to it as a prop. */
const List = (p: { items: unknown }) => core.h('ul', null, () => p.items as never)
/** A row component reading its prop lazily. */
const Row = (p: { label: string }) => core.h('li', null, () => p.label)

interface Shape {
  name: string
  src: string
  /** The text (or class) of the SECOND row, after its signals changed. */
  read: (c: HTMLElement) => string
}

const second = (sel: string) => (c: HTMLElement) => c.querySelectorAll(sel)[1]?.textContent ?? ''

const SHAPES: Shape[] = [
  {
    name: 'h()-path child of a component: text',
    src: 'function App() { return <Comp>{rows().map((row) => <li key={row.id}>{row.label()}</li>)}</Comp> }',
    read: second('li'),
  },
  {
    name: 'h()-path child of a component: attribute',
    src: 'function App() { return <Comp>{rows().map((row) => <li key={row.id} class={row.cls()}>x</li>)}</Comp> }',
    read: (c) => c.querySelectorAll('li')[1]?.className ?? '',
  },
  {
    name: 'h()-path child of a component: component row',
    src: 'function App() { return <Comp>{rows().map((row) => <Row key={row.id} label={row.label()} />)}</Comp> }',
    read: second('li'),
  },
  {
    name: 'component prop holding the list',
    src: 'function App() { return <List items={rows().map((row) => <li key={row.id}>{row.label()}</li>)} /> }',
    read: second('li'),
  },
  {
    name: 'nested keyed .map inside a keyed row',
    src: 'function App() { return <Comp>{rows().map((row) => <li key={row.id}>{row.kids().map((k) => <b key={k.id}>{row.label()}</b>)}</li>)}</Comp> }',
    read: second('b'),
  },
  {
    name: '<For> (control)',
    src: 'function App() { return <ul><For each={rows} by={(r) => r.id}>{(row) => <li>{row.label()}</li>}</For></ul> }',
    read: second('li'),
  },
  {
    name: 'template hole: text (the reported shape)',
    src: 'function App() { return <table><tbody>{rows().map((row) => <tr key={row.id}><td>{row.id}</td><td class="l">{row.label()}</td></tr>)}</tbody></table> }',
    read: (c) => c.querySelectorAll('td.l')[1]?.textContent ?? '',
  },
  {
    name: 'template hole in SVG content (walked on the h() path)',
    src: 'function App() { return <svg>{rows().map((row) => <g key={row.id}><text class="l">{row.label()}</text></g>)}</svg> }',
    read: (c) => c.querySelectorAll('text.l')[1]?.textContent ?? '',
  },
  {
    name: 'template hole: explicit accessor',
    src: 'function App() { return <ul>{() => rows().map((row) => <li key={row.id}>{row.label()}</li>)}</ul> }',
    read: second('li'),
  },
]

function expectRowUpdatesInPlace(compile: Backend, shape: Shape): void {
  const rows = signal([mk(1), mk(2), mk(3)])
  const c = mountApp(load(compile, shape.src, { rows, Comp, List, Row }))
  const before = c.querySelectorAll('li, tr, g')[1]
  rows()[1]!.label.set('CHANGED')
  rows()[1]!.cls.set('CHANGED')
  expect(shape.read(c)).toBe('CHANGED')
  // The row was updated in place, not re-created.
  expect(c.querySelectorAll('li, tr, g')[1]).toBe(before)
}

describe('keyed .map() row reads its own signals (compiled)', () => {
  for (const [name, compile] of backends) {
    for (const shape of SHAPES) {
      it(`${name}: ${shape.name}`, () => {
        expectRowUpdatesInPlace(compile, shape)
      })
    }

    it(`${name}: rows walked from an SVG hole are SVG elements`, () => {
      const rows = signal([mk(1), mk(2)])
      const src = SHAPES.find((s) => s.src.includes('<svg>'))!.src
      const c = mountApp(load(compile, src, { rows }))
      const g = c.querySelectorAll('g')
      expect(g.length).toBe(2)
      for (const el of [...g, ...c.querySelectorAll('text')]) {
        expect(el.namespaceURI).toBe('http://www.w3.org/2000/svg')
      }
    })

    it(`${name}: SSR → hydrate, then a row's signal updates its adopted row`, async () => {
      const src = SHAPES[0]!.src
      const rows = signal([mk(1), mk(2)])
      const html = await renderToString(core.h(load(compile, src, { rows, Comp }, true) as never, null))
      const host = document.createElement('div')
      host.innerHTML = html
      document.body.appendChild(host)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const dispose = dom.hydrateRoot(host, core.h(load(compile, src, { rows, Comp }) as never, null))
      mounted.push(dispose)
      expect(warn).not.toHaveBeenCalled()
      const li = host.querySelectorAll('li')[1]
      rows()[1]!.label.set('CHANGED')
      expect(host.querySelectorAll('li')[1]).toBe(li)
      expect(li!.textContent).toBe('CHANGED')
    })

    // The server range of an SVG hole carries no markers, so hydration rebuilds
    // the rows (no warning); this locks that a hydrated row then updates in place.
    it(`${name}: SSR → hydrate an SVG hole, then a row's signal updates that row`, async () => {
      const src = SHAPES.find((s) => s.src.includes('<svg>'))!.src
      const rows = signal([mk(1), mk(2)])
      const html = await renderToString(core.h(load(compile, src, { rows }, true) as never, null))
      const host = document.createElement('div')
      host.innerHTML = html
      document.body.appendChild(host)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const dispose = dom.hydrateRoot(host, core.h(load(compile, src, { rows }) as never, null))
      mounted.push(dispose)
      expect(warn).not.toHaveBeenCalled()
      expect(host.querySelectorAll('text.l')).toHaveLength(2)
      const text = host.querySelectorAll('text.l')[1]
      rows()[1]!.label.set('CHANGED')
      expect(host.querySelectorAll('text.l')[1]).toBe(text)
      expect(text!.textContent).toBe('CHANGED')
    })
  }
})

describe('keyed .map() row contract with hand-written h()', () => {
  it('an accessor child and an accessor attribute in a kept row stay live', () => {
    const rows = signal([mk(1), mk(2)])
    const c = mountApp(() =>
      core.h('ul', null, () =>
        rows().map((r) => core.h('li', { key: r.id, class: () => r.cls() }, () => r.label())),
      ),
    )
    const li = c.querySelectorAll('li')[1]
    rows()[1]!.label.set('X')
    rows()[1]!.cls.set('b')
    expect(c.querySelectorAll('li')[1]).toBe(li)
    expect(li!.textContent).toBe('X')
    expect(li!.className).toBe('b')
  })

  it('a value read eagerly while building the row is captured once per key, as in a <For> row', () => {
    const rows = signal([mk(1), mk(2)])
    const c = mountApp(() =>
      core.h(
        'div',
        null,
        core.h('ul', null, () => rows().map((r) => core.h('li', { key: r.id }, r.label()))),
        core.h(
          'ol',
          null,
          core.h(core.For, { each: rows, by: (r: ReturnType<typeof mk>) => r.id, children: (r: ReturnType<typeof mk>) => core.h('li', null, r.label()) }),
        ),
      ),
    )
    rows()[1]!.label.set('X')
    expect(c.querySelectorAll('ul li')[1]!.textContent).toBe('L2')
    expect(c.querySelectorAll('ol li')[1]!.textContent).toBe('L2')
  })
})
