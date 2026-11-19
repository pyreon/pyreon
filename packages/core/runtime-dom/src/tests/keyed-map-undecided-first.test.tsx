/**
 * A keyed `.map()` list whose FIRST value says nothing about its shape — an
 * empty array, or nullish (`rows()?.map(…)` before the data arrives) — still
 * reconciles by key once rows arrive.
 *
 * The accessor dispatcher (`mountAccessorChild`) chooses the machinery once:
 * keyed reconciler, general reactive mount, or text. It chose on the first
 * value, and `[]` is not a keyed array, so the slot was pinned to the general
 * path and every later update re-created every row — the DOM state a row holds
 * (focus, typed input, scroll, a running transition) was lost on every change,
 * in the common case where data arrives after mount. Hydration over an empty
 * server list took the same general path directly.
 *
 * Now an undecided value mounts nothing and the dispatcher classifies again on
 * its next run (`isUndecidedChild`); hydration over an empty server range
 * mounts that same dispatcher. A decided slot stays decided. Real compiler
 * (both backends) and hand-written `h()`.
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

const { h } = core

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

const cleanups: (() => void)[] = []

afterEach(() => {
  for (const c of cleanups.splice(0)) c()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function host(): HTMLElement {
  const c = document.createElement('div')
  document.body.appendChild(c)

  return c
}

function mountInto(vnode: core.VNodeChild): HTMLElement {
  const c = host()
  cleanups.push(dom.mount(vnode, c))

  return c
}

const texts = (c: HTMLElement, sel = 'li') => [...c.querySelectorAll(sel)].map((n) => n.textContent)

/** Fill, swap two rows, and check every surviving row kept its DOM node. */
function expectKeyedAfterUndecided(c: HTMLElement, rows: { set(v: number[]): void }, sel = 'li'): void {
  rows.set([1, 2, 3])
  const nodes = [...c.querySelectorAll(sel)]
  expect(texts(c, sel)).toEqual(['1', '2', '3'])
  rows.set([1, 3, 2])
  expect(texts(c, sel)).toEqual(['1', '3', '2'])
  const after = [...c.querySelectorAll(sel)]
  expect(after[0]).toBe(nodes[0])
  expect(after[1]).toBe(nodes[2])
  expect(after[2]).toBe(nodes[1])
  rows.set([4, 1])
  expect(texts(c, sel)).toEqual(['4', '1'])
  expect(c.querySelectorAll(sel)[1]).toBe(nodes[0])
}

describe('keyed .map() first rendered empty or nullish (h())', () => {
  it('an empty first render still reconciles by key', () => {
    const rows = signal<number[]>([])
    const c = mountInto(h('ul', null, () => rows().map((id) => h('li', { key: id }, String(id)))))
    expectKeyedAfterUndecided(c, rows)
  })

  it('an undefined first render (`rows()?.map`) still reconciles by key', () => {
    const rows = signal<number[] | undefined>(undefined)
    const c = mountInto(h('ul', null, () => rows()?.map((id) => h('li', { key: id }, String(id)))))
    expectKeyedAfterUndecided(c, rows as never)
  })

  it('keeps sibling order while undecided and after deciding', () => {
    const rows = signal<number[]>([])
    const c = mountInto(
      h('ul', null, h('li', null, 'head'), () => rows().map((id) => h('li', { key: id }, String(id))), h('li', null, 'tail')),
    )
    expect(texts(c)).toEqual(['head', 'tail'])
    rows.set([1, 2])
    expect(texts(c)).toEqual(['head', '1', '2', 'tail'])
  })

  it('switches between keyed, unkeyed, empty, nullish and text content', () => {
    const v = signal<core.VNodeChild>([])
    const c = mountInto(h('ul', null, (() => v()) as () => core.VNode))
    v.set([h('li', { key: 1 }, 'a'), h('li', { key: 2 }, 'b')])
    const a = c.querySelector('li')
    v.set([h('li', { key: 2 }, 'b'), h('li', { key: 1 }, 'a')])
    expect(texts(c)).toEqual(['b', 'a'])
    expect(c.querySelectorAll('li')[1]).toBe(a)
    v.set([h('li', null, 'u1'), h('li', null, 'u2')])
    expect(texts(c)).toEqual(['u1', 'u2'])
    v.set([])
    expect(texts(c)).toEqual([])
    v.set(null)
    expect(c.textContent).toBe('')
    v.set('plain')
    expect(c.textContent).toBe('plain')
    v.set(h('li', { key: 9 }, 'lone'))
    expect(texts(c)).toEqual(['lone'])
    v.set([h('li', { key: 1 }, 'a'), h('li', { key: 9 }, 'lone')])
    expect(texts(c)).toEqual(['a', 'lone'])
  })

  it('a slot that is empty first and then text becomes a text binding', () => {
    const v = signal<string | null>(null)
    const c = mountInto(h('p', null, () => v()))
    v.set('one')
    const text = c.querySelector('p')!.firstChild
    v.set('two')
    expect(c.textContent).toBe('two')
    expect(c.querySelector('p')!.firstChild).toBe(text)
  })

  it('duplicate keys after an empty first render keep first-wins order', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const rows = signal<number[]>([])
    const c = mountInto(h('ul', null, () => rows().map((id) => h('li', { key: id }, String(id)))))
    rows.set([1, 2, 1, 3])
    expect(texts(c)).toEqual(['1', '2', '3'])
    rows.set([3, 1, 3, 2])
    expect(texts(c)).toEqual(['3', '1', '2'])
  })

  it('unmounting while still undecided, and after deciding late, removes everything', () => {
    const rows = signal<number[]>([])
    const c = host()
    const dispose = dom.mount(h('ul', null, () => rows().map((id) => h('li', { key: id }, String(id)))), c)
    dispose()
    expect(c.innerHTML).toBe('')
    rows.set([1])
    expect(c.innerHTML).toBe('')

    const late = signal<number[]>([])
    const d2 = dom.mount(h('ul', null, () => late().map((id) => h('li', { key: id }, String(id)))), c)
    late.set([1, 2])
    d2()
    expect(c.innerHTML).toBe('')
    late.set([3])
    expect(c.innerHTML).toBe('')
  })
})

const SRC = 'function App() { return <ul>{rows().map((id) => <li key={id}>{id}</li>)}</ul> }'
const SRC_UNDEF = 'function App() { return <ul>{rows()?.map((id) => <li key={id}>{id}</li>)}</ul> }'

describe('keyed .map() first rendered empty (compiled)', () => {
  for (const [name, compile] of backends) {
    it(`${name}: an empty first render still reconciles by key`, () => {
      const rows = signal<number[]>([])
      const c = mountInto(h(load(compile, SRC, { rows }) as never, null))
      expectKeyedAfterUndecided(c, rows)
    })

    it(`${name}: an undefined first render still reconciles by key`, () => {
      const rows = signal<number[] | undefined>(undefined)
      const c = mountInto(h(load(compile, SRC_UNDEF, { rows }) as never, null))
      expectKeyedAfterUndecided(c, rows as never)
    })

    for (const initial of [[], undefined]) {
      it(`${name}: SSR with ${initial === undefined ? 'no' : 'an empty'} list → hydrate → data arrives, keyed`, async () => {
        const src = initial === undefined ? SRC_UNDEF : SRC
        const rows = signal<number[] | undefined>(initial)
        const html = await renderToString(h(load(compile, src, { rows }, true) as never, null))
        const c = host()
        c.innerHTML = html
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        cleanups.push(dom.hydrateRoot(c, h(load(compile, src, { rows }) as never, null)))
        expect(warn).not.toHaveBeenCalled()
        expectKeyedAfterUndecided(c, rows as never)
      })
    }
  }

  it('h(): SSR with an empty list as an element’s non-sole child → hydrate → keyed', async () => {
    const rows = signal<number[]>([])
    const App = () => h('ul', null, h('li', null, 'head'), () => rows().map((id) => h('li', { key: id }, String(id))))
    const html = await renderToString(h(App, null))
    const c = host()
    c.innerHTML = html
    cleanups.push(dom.hydrateRoot(c, h(App, null)))
    rows.set([1, 2])
    const one = c.querySelectorAll('li')[1]
    rows.set([2, 1])
    expect(texts(c)).toEqual(['head', '2', '1'])
    expect(c.querySelectorAll('li')[2]).toBe(one)
  })
})
