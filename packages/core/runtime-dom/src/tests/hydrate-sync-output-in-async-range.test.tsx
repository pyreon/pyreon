/**
 * Regression lock — a component that is ASYNC on the server and SYNC on the
 * client hydrates INSIDE the server's `<!--$pas-->…<!--$pae-->` range.
 *
 * runtime-server wraps an async component's awaited output in the async
 * sentinels. `island()` is the shipped case: its server path awaits the loader
 * and renders the component inside `<pyreon-island>`, its client path returns
 * the bare `<pyreon-island>` marker synchronously. `hydrateComponent` only
 * consumed the range for a Promise output, so a sync output was hydrated
 * against the `<!--$pas-->` comment itself: `[Pyreon] Hydration mismatch (tag):
 * expected pyreon-island, got 8`, a fresh empty client node mounted, the
 * server subtree swept — a blank until the island's own trigger fired.
 *
 * Specs:
 *  - hand-written SSR range: no mismatch, the SAME element adopted, the
 *    sibling after `$pae` hydrates (handler + reactive text bound);
 *  - real `renderToString` (async server component) → sync client component;
 *  - the compiled path: a REAL `transformJSX` client tree whose component
 *    child is a mount hole, and a compiled component whose root is a `_tpl`;
 *  - a client output that claims less than the range: the unclaimed server
 *    node is swept, siblings untouched; a `null` output leaves the range
 *    standing and still hydrates the siblings; unmount removes the markers.
 *
 * Bisect (recorded in the PR): removing the sync-range branch in
 * `hydrateComponent` fails every adoption spec with a `tag` mismatch
 * (`expected pyreon-island, got 8`).
 */
import { transformJSX } from '@pyreon/compiler'
import { Fragment, h } from '@pyreon/core'
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { _bind, renderEffect, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  _applyProps,
  _bindDirect,
  _bindProp,
  _bindText,
  _mountChild,
  _mountSlot,
  _setAttr,
  _setClass,
  _setStyle,
  _setStyleOnce,
  _textSlot,
  _tpl,
  hydrateRoot,
  onHydrationMismatch,
} from '../index'
import { bindPolymorphicText } from '../mount'

let mismatches: string[]
let stopListening: () => void
beforeEach(() => {
  mismatches = []
  stopListening = onHydrationMismatch((ctx) => {
    mismatches.push(
      `${ctx.type}: expected ${String(ctx.expected)}, got ${String(ctx.actual)} at ${ctx.path}`,
    )
  })
})
afterEach(() => {
  stopListening()
  document.body.innerHTML = ''
})

function container(html: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = html
  document.body.appendChild(el)
  return el
}

/** An async component (the server side of the shape); `ComponentFn` is typed sync. */
const asServerComponent = (fn: () => Promise<VNodeChild>): ComponentFn =>
  fn as unknown as ComponentFn

const comments = (el: Node): string[] => {
  const out: string[] = []
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_COMMENT)
  while (walk.nextNode()) out.push((walk.currentNode as Comment).data)
  return out
}

/** The island shape: the server rendered the content INSIDE the host element. */
const ISLAND_SSR =
  '<section><h1>Docs</h1>' +
  '<!--$pas--><pyreon-island data-component="Demo"><form class="demo"><input name="q"></form></pyreon-island><!--$pae-->' +
  '<p class="after">0</p></section>'

describe('sync client output over an async server range', () => {
  it('adopts the server element inside the range and hydrates the sibling after $pae', () => {
    const host = container(ISLAND_SSR)
    const islandEl = host.querySelector('pyreon-island')!
    const form = host.querySelector('form')!
    const after = host.querySelector('p.after')!

    // Client: the component returns the bare host element synchronously —
    // exactly what `island()` does on the client.
    const Demo = (): VNodeChild => h('pyreon-island', { 'data-component': 'Demo' })
    const count = signal(0)
    let clicks = 0
    hydrateRoot(
      host,
      h(
        'section',
        null,
        h('h1', null, 'Docs'),
        h(Demo, null),
        h('p', { class: 'after', onClick: () => clicks++ }, () => String(count())),
      ),
    )

    expect(mismatches).toEqual([])
    expect(host.querySelector('pyreon-island')).toBe(islandEl)
    expect(host.querySelectorAll('pyreon-island')).toHaveLength(1)
    // A childless client host leaves the island's interior to the island.
    expect(host.querySelector('form')).toBe(form)
    expect(host.querySelector('p.after')).toBe(after)

    // The sibling after the end marker is live.
    count.set(5)
    expect(after.textContent).toBe('5')
    ;(after as HTMLElement).click()
    expect(clicks).toBe(1)
  })

  it('hydrates real renderToString output of an async server component with a sync client one', async () => {
    const label = signal('hi')
    async function ServerBox(): Promise<VNodeChild> {
      return h('div', { class: 'box' }, h('span', null, 'hi'))
    }
    const html = await renderToString(
      h('main', null, h(asServerComponent(ServerBox), null), h('footer', null, 'end')),
    )
    expect(html).toContain('<!--$pas--><div class="box">')
    const host = container(html)
    const box = host.querySelector('.box')!
    const span = host.querySelector('span')!
    const footer = host.querySelector('footer')!

    const ClientBox = (): VNodeChild =>
      h(
        'div',
        { class: 'box' },
        h('span', null, () => label()),
      )
    hydrateRoot(host, h('main', null, h(ClientBox, null), h('footer', null, 'end')))

    expect(mismatches).toEqual([])
    expect(host.querySelector('.box')).toBe(box)
    expect(host.querySelector('span')).toBe(span)
    expect(host.querySelector('footer')).toBe(footer)
    label.set('bye')
    expect(span.textContent).toBe('bye')
  })

  it('sweeps server nodes inside the range that the sync output did not claim', () => {
    const host = container('<div><!--$pas--><b>a</b><i>extra</i><!--$pae--><p>after</p></div>')
    const b = host.querySelector('b')!
    const p = host.querySelector('p')!
    const Comp = (): VNodeChild => h('b', null, 'a')
    hydrateRoot(host, h('div', null, h(Comp, null), h('p', null, 'after')))

    expect(host.querySelector('b')).toBe(b)
    expect(host.querySelector('i')).toBeNull()
    expect(host.querySelector('p')).toBe(p)
  })

  it('a null client output leaves the range standing and still hydrates the siblings', () => {
    const host = container('<div><!--$pas--><b>server</b><!--$pae--><p>after</p></div>')
    const p = host.querySelector('p')!
    const Comp = (): VNodeChild => null
    let clicks = 0
    hydrateRoot(host, h('div', null, h(Comp, null), h('p', { onClick: () => clicks++ }, 'after')))

    expect(mismatches).toEqual([])
    expect(host.querySelector('b')?.textContent).toBe('server')
    expect(host.querySelector('p')).toBe(p)
    ;(p as HTMLElement).click()
    expect(clicks).toBe(1)
  })

  it('nested async ranges bound by the MATCHING end marker', () => {
    const host = container(
      '<div><!--$pas--><span><!--$pas--><b>in</b><!--$pae--></span><!--$pae--><p>after</p></div>',
    )
    const span = host.querySelector('span')!
    const b = host.querySelector('b')!
    const p = host.querySelector('p')!
    const Inner = (): VNodeChild => h('b', null, 'in')
    const Outer = (): VNodeChild => h('span', null, h(Inner, null))
    hydrateRoot(host, h('div', null, h(Outer, null), h('p', null, 'after')))

    expect(mismatches).toEqual([])
    expect(host.querySelector('span')).toBe(span)
    expect(host.querySelector('b')).toBe(b)
    expect(host.querySelector('p')).toBe(p)
  })

  it('unmount removes the range markers with the component', () => {
    const host = container('<div><!--$pas--><b>a</b><!--$pae--></div>')
    const Comp = (): VNodeChild => h('b', null, 'a')
    const dispose = hydrateRoot(host, h('div', null, h(Comp, null)))
    expect(comments(host)).toEqual(['$pas', '$pae'])
    dispose()
    expect(comments(host)).toEqual([])
  })
})

// ─── Compiled path (real transformJSX) ──────────────────────────────────────

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
  _setClass,
  _mountSlot,
  _mountChild,
  _textSlot,
  bindPolymorphicText,
  h,
  Fragment,
  signal,
}

function compile(source: string, globals: Record<string, unknown>): () => unknown {
  const { code } = transformJSX(source, 'test.tsx')
  const body = transformSync(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''), {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
  const names = [...Object.keys(RUNTIME_DEPS), ...Object.keys(globals)]
  const values = [...Object.values(RUNTIME_DEPS), ...Object.values(globals)]
  return new Function(...names, `${body}\nreturn App`)(...values) as () => unknown
}

describe('sync client output over an async server range — compiled templates', () => {
  it('a component child of a compiled template (mount hole) adopts inside the range', () => {
    const host = container(ISLAND_SSR)
    const islandEl = host.querySelector('pyreon-island')!
    const form = host.querySelector('form')!
    const after = host.querySelector('p.after')!

    const Demo = (): VNodeChild => h('pyreon-island', { 'data-component': 'Demo' })
    const count = signal(0)
    const App = compile(
      `const App = () => <section><h1>Docs</h1><Demo /><p class="after">{count()}</p></section>`,
      { Demo, count },
    )
    hydrateRoot(host, h(App as never, null))

    expect(mismatches).toEqual([])
    expect(host.querySelector('pyreon-island')).toBe(islandEl)
    expect(host.querySelector('form')).toBe(form)
    expect(host.querySelector('p.after')).toBe(after)
    count.set(3)
    expect(after.textContent).toBe('3')
  })

  it('a compiled component whose ROOT is a _tpl adopts the element inside the range', async () => {
    async function ServerCard(): Promise<VNodeChild> {
      return h('article', { class: 'card' }, h('em', null, 'x'))
    }
    const html = await renderToString(
      h('div', null, h(asServerComponent(ServerCard), null), h('p', null, 'after')),
    )
    const host = container(html)
    const article = host.querySelector('article')!
    const em = host.querySelector('em')!
    const p = host.querySelector('p')!

    const tag = signal('x')
    const App = compile(
      `const Card = () => <article class="card"><em>{tag()}</em></article>
const App = () => <div><Card /><p>after</p></div>`,
      { tag },
    )
    hydrateRoot(host, h(App as never, null))

    expect(mismatches).toEqual([])
    expect(host.querySelector('article')).toBe(article)
    expect(host.querySelector('em')).toBe(em)
    expect(host.querySelector('p')).toBe(p)
    tag.set('y')
    expect(em.textContent).toBe('y')
  })
})
