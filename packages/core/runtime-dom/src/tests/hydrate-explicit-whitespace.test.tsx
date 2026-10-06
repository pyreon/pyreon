/**
 * Regression lock — an EXPLICITLY rendered whitespace-only text child must be
 * ADOPTED by hydration, not skipped and re-inserted (issue #3832).
 *
 * THE BUG. The walker's cursor helpers (`firstReal`/`nextReal`) skip
 * whitespace-only text nodes unconditionally, on the premise that they are
 * server formatting. But SSR of `<div><First/>{' '}<span>Two</span></div>`
 * emits the space as a real text node, byte-identical to ignorable
 * formatting. The cursor skipped it, the static-text branch then saw
 * `<span>`, warned `expected TextNode, got 1` and inserted a SECOND space.
 *
 * The decision cannot be made from the DOM alone (the two are the same
 * bytes), so it is made by the parallel VNODE walk: a whitespace text vnode
 * claims the whitespace node the cursor skipped immediately before it.
 */
import { renderToString } from '@pyreon/runtime-server'
import { For, Show, h } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hydrateRoot } from '../hydrate'
import { onHydrationMismatch } from '../hydration-debug'
import { mount } from '../index'

let host: HTMLElement
let seen: string[]
let off: () => void
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  seen = []
  off = onHydrationMismatch((c) => seen.push(`${c.type}:${c.expected}|${c.actual}`))
})
afterEach(() => {
  off()
  host.remove()
})

const First = () => h('span', null, 'One')

/** SSR → hydrate; returns [serverHTML, hydratedHTML, freshClientHTML]. */
async function run(view: () => VNodeChild) {
  host.innerHTML = await renderToString(view() as never)
  const before = host.innerHTML
  const spans = [...host.querySelectorAll('*')]
  const dispose = hydrateRoot(host, view() as never)
  const after = host.innerHTML
  const kept = [...host.querySelectorAll('*')].every((e, i) => e === spans[i])
  dispose()
  const fresh = document.createElement('div')
  document.body.appendChild(fresh)
  const un = mount(view() as never, fresh)
  const client = fresh.innerHTML
  un()
  fresh.remove()
  const strip = (h: string) => h.replace(/<!--[\s\S]*?-->/g, '')
  return { before: strip(before), after: strip(after), client: strip(client), kept }
}

const WS = [' ', '  ', '\n', '\t', ' \n ', ' ']

describe('explicit whitespace text children hydrate in place', () => {
  for (const ws of WS) {
    const label = JSON.stringify(ws)
    it(`between component and element ${label}`, async () => {
      const r = await run(() => h('div', null, h(First, null), ws, h('span', null, 'Two')))
      expect(r.after).toBe(r.before)
      expect(r.after).toBe(r.client)
      expect(r.kept).toBe(true)
      expect(seen).toEqual([])
    })
    it(`leading ${label}`, async () => {
      const r = await run(() => h('div', null, ws, h('span', null, 'Two')))
      expect(r.after).toBe(r.before)
      expect(seen).toEqual([])
    })
    it(`trailing ${label}`, async () => {
      const r = await run(() => h('div', null, h('span', null, 'Two'), ws))
      expect(r.after).toBe(r.before)
      expect(seen).toEqual([])
    })
    it(`only child ${label}`, async () => {
      const r = await run(() => h('div', null, ws))
      expect(r.after).toBe(r.before)
      expect(seen).toEqual([])
    })
    it(`merged with adjacent text ${label}`, async () => {
      const r = await run(() => h('div', null, 'a', ws, 'b'))
      expect(r.after).toBe(r.before)
      expect(seen).toEqual([])
    })
    it(`between two elements and before another ${label}`, async () => {
      const r = await run(() =>
        h('div', null, h('i', null, 'x'), ws, h('b', null, 'y'), ws, h('u', null, 'z')),
      )
      expect(r.after).toBe(r.before)
      expect(r.kept).toBe(true)
      expect(seen).toEqual([])
    })
  }

  it('between element and a reactive accessor', async () => {
    const s = signal('v')
    const r = await run(() => h('div', null, h('i', null, 'x'), ' ', () => s(), ' ', h('b', null, 'y')))
    expect(r.after).toBe(r.before)
    expect(seen).toEqual([])
  })
  it('around a <For> and a <Show>', async () => {
    const items = signal([1, 2])
    const r = await run(() =>
      h(
        'div',
        null,
        h('i', null, 'x'),
        ' ',
        h(For, { each: items, by: (n: number) => n }, (n: number) => h('em', null, String(n))),
        ' ',
        h(Show, { when: () => true }, h('b', null, 'y')),
        ' ',
        h('u', null, 'z'),
      ),
    )
    expect(r.after).toBe(r.before)
    expect(seen).toEqual([])
  })
  it('inside <For> rows (interpretive walk AND plan replay)', async () => {
    const items = signal([1, 2, 3])
    const r = await run(() =>
      h(
        'ul',
        null,
        h(For, { each: items, by: (n: number) => n }, (n: number) =>
          h('li', null, h('i', null, String(n)), ' ', h('b', null, 'y'), ' '),
        ),
      ),
    )
    expect(r.after).toBe(r.before)
    expect(r.kept).toBe(true)
    expect(seen).toEqual([])
  })
  it('inside <pre> and <textarea>', async () => {
    const r = await run(() =>
      h('div', null, h('pre', null, ' ', h('b', null, 'x'), ' '), h('textarea', null, ' ')),
    )
    expect(r.after).toBe(r.before)
    expect(seen).toEqual([])
  })
  it('empty string child still renders nothing and does not warn', async () => {
    const r = await run(() => h('div', null, h(First, null), '', h('span', null, 'Two')))
    expect(r.after).toBe(r.before)
    expect(seen).toEqual([])
  })
  it('two whitespace vnodes separated by a null still claim distinct nodes', async () => {
    const r = await run(() => h('div', null, ' ', h('i', null, 'x'), null, ' ', ' ', h('b', null, 'y')))
    expect(r.after).toBe(r.before)
    expect(seen).toEqual([])
  })
  it('ignorable formatting whitespace (no whitespace vnode) is still skipped', () => {
    host.innerHTML = '<div>\n  <span>One</span>\n  <span>Two</span>\n</div>'
    const before = host.innerHTML
    const dispose = hydrateRoot(host, h('div', null, h('span', null, 'One'), h('span', null, 'Two')))
    expect(host.innerHTML).toBe(before)
    expect(seen).toEqual([])
    dispose()
  })
})
