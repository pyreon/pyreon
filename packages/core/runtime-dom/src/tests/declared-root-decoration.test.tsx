/**
 * #4382, the hydration half: a component that decorates its compiled child
 * (adds a class / style to the `_tpl` item's element at mount) has the server
 * add the same to the child's root tag (`withRootAttrs`). The adoption
 * verifier's static-skeleton gate then sees `class="own pre"` where the
 * template says `class="own"`, and refused the element: it was re-created.
 *
 * `_declareRootDecoration(item)` is the decorating component's declaration.
 * For that item only, the gate leaves the ROOT's `class` and `style` out of the
 * comparison. Everything else is still compared.
 *
 * Real compiler on both sides (`ssr` + `ssrTemplate`, and the client emit), the
 * real `renderToString`, the real `hydrateRoot`.
 */
import { transformJSX } from '@pyreon/compiler'
import * as core from '@pyreon/core'
import { Fragment, h, onMount } from '@pyreon/core'
import type { NativeItem, VNodeChild } from '@pyreon/core'
import * as server from '@pyreon/runtime-server'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import * as dom from '../index'
import { _declareRootDecoration, hydrateRoot, onHydrationMismatch } from '../index'

const underscored = (m: object) => Object.fromEntries(Object.entries(m).filter(([k]) => k.startsWith('_')))

function compile(src: string, scope: Record<string, unknown>, ssr: boolean): () => unknown {
  const { code } = transformJSX(src, 'case.tsx', ssr ? { ssr: true, ssrTemplate: true } : {})
  const js = transformSync(code.replace(/^import[^\n]*\n/gm, ''), {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
  const deps = { ...underscored(core), ...underscored(ssr ? server : dom), h, Fragment, ...scope }

  return new Function(...Object.keys(deps), `${js}\nreturn App`)(...Object.values(deps)) as () => unknown
}

const flatten = (children: unknown): unknown[] => {
  if (typeof children === 'function') return flatten((children as () => unknown)())

  return Array.isArray(children) ? children.flatMap(flatten) : [children]
}

const EXTRA = { class: 'pre', style: { opacity: 0 } }

/** The server side of a decorating component: the child's root tag takes the extras. */
const ServerDeco = (props: { children?: unknown }) =>
  h(
    'ul',
    null,
    ...flatten(props.children).map((c) =>
      (c as { withRootAttrs: (e: Record<string, unknown>) => VNodeChild }).withRootAttrs(EXTRA),
    ),
  )

/** Mounts a compiled item and decorates its element, as kinetic's `NativeChild` does. */
const Decorated = (props: { item: NativeItem }) => {
  onMount(() => {
    const el = props.item.el as HTMLElement
    el.classList.add('pre')
    el.style.opacity = '0'
  })

  return props.item as never
}

/** The client side; `declare` is the one thing under test. */
const clientDeco = (declare: boolean) => (props: { children?: unknown }) =>
  h(
    'ul',
    null,
    ...flatten(props.children).map((c) => {
      if (declare) _declareRootDecoration(c as NativeItem)

      return h(Decorated, { item: c as NativeItem })
    }),
  )

const hosts: HTMLElement[] = []

afterEach(() => {
  for (const el of hosts.splice(0)) el.remove()
})

async function roundTrip(serverSrc: string, clientSrc: string, declare: boolean, scope: Record<string, unknown> = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  hosts.push(host)
  host.innerHTML = await renderToString(h(compile(serverSrc, { Deco: ServerDeco, ...scope }, true) as never, null) as never)
  const serverHtml = host.innerHTML
  const before = [...host.querySelectorAll('li')]
  const reports: string[] = []
  const errors: unknown[] = []
  const off = onHydrationMismatch((m) => reports.push(`${m.type}: ${String(m.expected)} vs ${String(m.actual)}`))
  // A component that throws during the walk leaves the server DOM in place,
  // which would pass an identity check without hydrating anything.
  const origError = console.error
  console.error = (...args: unknown[]) => errors.push(args)
  try {
    hydrateRoot(host, h(compile(clientSrc, { Deco: clientDeco(declare), ...scope }, false) as never, null))
  } finally {
    off()
    console.error = origError
  }
  expect(errors).toEqual([])
  const after = [...host.querySelectorAll('li')]

  return { serverHtml, before, after, adopted: after.map((li, i) => li === before[i]), reports }
}

describe('a declared root decoration is adopted at hydration (#4382)', () => {
  const src = 'const App = () => <Deco><li class="own">a</li><li>b</li></Deco>'

  it('the premise: the server root carries the decoration, the client child is a remountable _tpl item', async () => {
    expect(transformJSX(src, 'case.tsx').code).toContain('_tpl("<li class=\\"own\\">a</li>", () => null, 1)')
    const r = await roundTrip(src, src, true)
    expect(r.serverHtml).toContain('<li class="own pre" style="opacity: 0">a</li>')
    expect(r.serverHtml).toContain('<li class="pre" style="opacity: 0">b</li>')
  })

  it('declared: both items are adopted by identity, stay decorated, nothing reported', async () => {
    const r = await roundTrip(src, src, true)
    expect(r.adopted).toEqual([true, true])
    expect(r.after.map((li) => li.className)).toEqual(['own pre', 'pre'])
    expect(r.after.map((li) => li.style.opacity)).toEqual(['0', '0'])
    expect(r.reports).toEqual([])
  })

  it('NOT declared: the gate still refuses a root whose class/style differ (the relaxation is opt-in)', async () => {
    const r = await roundTrip(src, src, false)
    // The second item's template has no static class or style, so the gate has
    // nothing to compare on its root and adopts it either way.
    expect(r.adopted).toEqual([false, true])
    // Rebuilt and decorated at mount: correct, simply not adopted.
    expect(r.after.map((li) => li.className)).toEqual(['own pre', 'pre'])
  })

  it("declared, root with its own static style: the server's merged style is adopted", async () => {
    const styled = 'const App = () => <Deco><li style="color: red">a</li></Deco>'
    const r = await roundTrip(styled, styled, true)
    expect(r.serverHtml).toContain('<li style="color: red; opacity: 0" class="pre">a</li>')
    expect(r.adopted).toEqual([true])
    expect(r.after[0]!.style.color).toBe('red')
    expect(r.reports).toEqual([])
  })

  it('declared, but ANOTHER root attribute differs: refused, as for any template', async () => {
    const r = await roundTrip(
      'const App = () => <Deco><li class="own" data-v="server">a</li></Deco>',
      'const App = () => <Deco><li class="own" data-v="client">a</li></Deco>',
      true,
    )
    expect(r.adopted).toEqual([false])
    expect(r.after[0]!.getAttribute('data-v')).toBe('client')
  })

  it('declared, but a DESCENDANT class differs: refused (only the root is the decorator\'s)', async () => {
    const r = await roundTrip(
      'const App = () => <Deco><li class="own"><b class="server">a</b></li></Deco>',
      'const App = () => <Deco><li class="own"><b class="client">a</b></li></Deco>',
      true,
    )
    expect(r.adopted).toEqual([false])
    expect(r.after[0]!.querySelector('b')!.className).toBe('client')
  })

  it('declared on a plain (non-remountable) _tpl item, as an element held in a const is', async () => {
    const held = 'const App = () => { const item = <li class="own">a</li>; return <Deco>{item}</Deco> }'
    expect(transformJSX(held, 'case.tsx').code).toContain('_tpl("<li class=\\"own\\">a</li>", () => null)')
    const r = await roundTrip(held, held, true)
    expect(r.serverHtml).toContain('<li class="own pre" style="opacity: 0">a</li>')
    expect(r.adopted).toEqual([true])
    expect(r.after[0]!.className).toBe('own pre')
    expect(r.reports).toEqual([])
    // The same item, undeclared, is refused.
    expect((await roundTrip(held, held, false)).adopted).toEqual([false])
  })
})
