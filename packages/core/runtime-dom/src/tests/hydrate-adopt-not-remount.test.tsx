/**
 * #4448: an accessor child whose server range carries no `<!--$-->` markers
 * (the server rendered the same content WITHOUT an accessor there:
 * `props.children` on one side, `<Provider>{props.children}</Provider>` on the
 * other) removed one server node and mounted the subtree fresh, with no report
 * in dev or production. It now adopts the server nodes by walking the
 * accessor's first value against them, as a static child is walked; a real
 * divergence inside is reported by that walk, and the binding stays live.
 *
 * The compiled case goes through the REAL `transformJSX` (client and SSR).
 */
import { transformJSX } from '@pyreon/compiler'
import * as core from '@pyreon/core'
import { Fragment, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import * as dom from '../index'
import { hydrateRoot, onHydrationMismatch } from '../index'

const DEPS: Record<string, unknown> = {
  ...Object.fromEntries(Object.entries(dom).filter(([k]) => k.startsWith('_'))),
  ...Object.fromEntries(Object.entries(core).filter(([k]) => k.startsWith('_'))),
  h,
  Fragment,
}

const lower = (code: string) =>
  transformSync(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''), {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code

function compile(src: string, scope: Record<string, unknown>, ssr: boolean): () => unknown {
  const { code } = transformJSX(src, 'case.tsx', ssr ? { ssr: true } : {})
  const deps = { ...DEPS, ...scope }
  return new Function(...Object.keys(deps), `${lower(code)}\nreturn App`)(...Object.values(deps)) as () => unknown
}

const hosts: HTMLElement[] = []

afterEach(() => {
  for (const el of hosts.splice(0)) el.remove()
})

const strip = (s: string) => s.replace(/<!--[^>]*-->/g, '')

/** SSR `server`, hydrate `client` over it; report what survived and what was said. */
async function roundTrip(server: () => unknown, client: () => unknown) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  hosts.push(host)
  host.innerHTML = await renderToString(h(server as never, null) as never)
  const before = [...host.querySelectorAll('*')]
  const reports: string[] = []
  const off = onHydrationMismatch((m) => reports.push(`${m.type}: ${String(m.expected)} vs ${String(m.actual)}`))
  try {
    hydrateRoot(host, h(client as never, null))
  } finally {
    off()
  }
  const fresh = document.createElement('div')
  dom.mount(h(client as never, null), fresh)

  return {
    replaced: before.filter((n) => !host.contains(n)).map((n) => n.tagName.toLowerCase()),
    reports,
    html: strip(host.innerHTML),
    freshHtml: strip(fresh.innerHTML),
    host,
  }
}

const Provider = (p: { children?: unknown }) => p.children as never
const ServerWrapper = (p: { children?: unknown }) => p.children as never

describe('#4448: an accessor over a marker-less server range adopts it', () => {
  it('h(): a client-only Provider around props.children', async () => {
    const ClientWrapper = (p: { children?: unknown }) => h(Provider, null, (() => p.children) as never)
    const child = () => h('div', { id: 'x' }, 'hi')
    const r = await roundTrip(
      () => h('main', null, h(ServerWrapper, null, child()), h('p', null, 'after')),
      () => h('main', null, h(ClientWrapper, null, child()), h('p', null, 'after')),
    )
    expect(r.html).toBe(r.freshHtml)
    expect(r.replaced).toEqual([])
    expect(r.reports).toEqual([])
  })

  it('compiled JSX: the issue shape, through transformJSX', async () => {
    const scope = { Provider }
    const server = compile(
      'const W = (props) => props.children\nconst App = () => <main><W><div id="x">hi</div></W><p>after</p></main>',
      scope,
      true,
    )
    const client = compile(
      'const W = (props) => <Provider>{props.children}</Provider>\nconst App = () => <main><W><div id="x">hi</div></W><p>after</p></main>',
      scope,
      false,
    )
    const r = await roundTrip(server, client)
    expect(r.html).toBe(r.freshHtml)
    expect(r.replaced).toEqual([])
    expect(r.reports).toEqual([])
  })

  it('a multi-node value is adopted whole, and the following sibling keeps its node', async () => {
    const ClientWrapper = (p: { children?: unknown }) => h(Provider, null, (() => p.children) as never)
    const kids = () => [h('b', null, '1'), 'mid', h('i', null, '2')]
    const r = await roundTrip(
      () => h('main', null, h(ServerWrapper, null, ...kids()), h('p', null, 'after')),
      () => h('main', null, h(ClientWrapper, null, ...kids()), h('p', null, 'after')),
    )
    expect(r.html).toBe(r.freshHtml)
    expect(r.replaced).toEqual([])
    expect(r.reports).toEqual([])
  })

  it('a real divergence inside is reported and repaired', async () => {
    const ClientWrapper = (p: { children?: unknown }) => h(Provider, null, (() => p.children) as never)
    const r = await roundTrip(
      () => h('main', null, h(ServerWrapper, null, h('div', null, 'server')), h('p', null, 'after')),
      () => h('main', null, h(ClientWrapper, null, h('div', null, 'client')), h('p', null, 'after')),
    )
    expect(r.html).toBe(r.freshHtml)
    expect(r.reports).toEqual(['text: client vs server'])
    expect(r.replaced).toEqual([])
  })

  it('the adopted binding stays live: a later value replaces exactly its own nodes', async () => {
    const which = signal<'a' | 'b'>('a')
    const view = () => (which() === 'a' ? h('div', { id: 'a' }, 'A') : h('section', { id: 'b' }, 'B'))
    const r = await roundTrip(
      () => h('main', null, view(), h('p', null, 'after')),
      () => h('main', null, () => view(), h('p', null, 'after')),
    )
    expect(r.replaced).toEqual([])
    which.set('b')
    expect(strip(r.host.innerHTML)).toBe('<main><section id="b">B</section><p>after</p></main>')
    which.set('a')
    expect(strip(r.host.innerHTML)).toBe('<main><div id="a">A</div><p>after</p></main>')
  })

  it('a keyed list still hydrates to the right DOM (it mounts fresh, as on the marked path)', async () => {
    const rows = () => [h('li', { key: 1 }, 'one'), h('li', { key: 2 }, 'two')]
    const r = await roundTrip(
      () => h('ul', null, rows(), h('li', null, 'tail')),
      () => h('ul', null, () => rows(), h('li', null, 'tail')),
    )
    expect(r.html).toBe(r.freshHtml)
    expect(r.reports).toEqual([])
  })
})
