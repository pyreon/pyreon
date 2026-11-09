/**
 * `createUniqueId()` is hydration-stable.
 *
 * It used to be one process-wide counter that nothing reset: the server's kept growing across requests, the client's
 * restarted at 0 on every page load, so an `id` in the server HTML and the id the hydrated component held in its
 * closure were different strings (`aria-controls="pyreon-2-listbox"` against a listbox that later rendered
 * `pyreon-7-listbox`). The id now comes from a scope — per request on the server, the default scope on the client,
 * one namespace per island — so both sides number the same components in the same order.
 *
 * Each spec renders on the server and then hydrates, and compares the id a component CAPTURED when it ran with the
 * id in the HTML the server produced for it. That is the only comparison that fails when the two disagree.
 */
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { _resetIdCounter, createUniqueId, h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { disableHydrationWarnings, hydrateRoot } from '../index'

const strip = (s: string) => s.replace(/<!--[\s\S]*?-->/g, '')
const idsIn = (html: string) => [...html.matchAll(/\bid="(pyreon-[\w-]+)"/g)].map((m) => m[1]!)

/** A field that records the id it was given — what the hydrated component's closure holds. */
function recorder(into: string[]) {
  return function Field(props: { label: string }): VNodeChild {
    const id = createUniqueId()
    into.push(id)
    return h('div', null, h('label', { for: id }, props.label), h('input', { id }))
  }
}

const tree = (Field: (p: { label: string }) => VNodeChild) =>
  h('form', null, h(Field, { label: 'a' }), h(Field, { label: 'b' }), h(Field, { label: 'c' }))

describe('createUniqueId — hydration-stable', () => {
  beforeAll(() => disableHydrationWarnings())
  beforeEach(() => _resetIdCounter())

  it('every request counts from 1, so the same page renders the same ids', async () => {
    const first = await renderToString(tree(recorder([])))
    const second = await renderToString(tree(recorder([])))
    expect(idsIn(first)).toEqual(['pyreon-1', 'pyreon-2', 'pyreon-3'])
    expect(idsIn(second)).toEqual(idsIn(first))
  })

  it('concurrent renders do not share a counter', async () => {
    // An async component: the renderer awaits it, which is what lets two renders interleave.
    const slow = (label: string): ComponentFn =>
      (async function Slow(): Promise<VNodeChild> {
        const id = createUniqueId()
        await new Promise((r) => setTimeout(r, label === 'a' ? 20 : 1))
        return h('p', { id }, createUniqueId())
      }) as unknown as ComponentFn
    const [a, b] = await Promise.all([renderToString(h(slow('a'), null)), renderToString(h(slow('b'), null))])
    // Each render starts at 1; a shared counter would hand the second one 3 and 4.
    expect(strip(a)).toBe('<p id="pyreon-1">pyreon-2</p>')
    expect(strip(b)).toBe('<p id="pyreon-1">pyreon-2</p>')
  })

  it('a hydrated component holds the id the server rendered', async () => {
    const serverIds: string[] = []
    const html = await renderToString(tree(recorder(serverIds)))
    expect(idsIn(html)).toEqual(serverIds)

    // A fresh page load: the client counter starts at 0, whatever the server did before.
    _resetIdCounter()
    const container = document.createElement('div')
    document.body.appendChild(container)
    container.innerHTML = html
    const clientIds: string[] = []
    hydrateRoot(container, tree(recorder(clientIds)))

    expect(clientIds).toEqual(serverIds)
    // And the adopted DOM still carries them, so label `for` and input `id` still pair up.
    expect([...container.querySelectorAll('input')].map((i) => i.id)).toEqual(serverIds)
    expect([...container.querySelectorAll('label')].map((l) => l.getAttribute('for'))).toEqual(serverIds)
    container.remove()
  })

  it('a server that has already rendered other pages does not shift a later page (the original bug)', async () => {
    for (let i = 0; i < 5; i++) await renderToString(tree(recorder([])))
    const serverIds: string[] = []
    const html = await renderToString(tree(recorder(serverIds)))
    expect(serverIds).toEqual(['pyreon-1', 'pyreon-2', 'pyreon-3'])

    _resetIdCounter()
    const container = document.createElement('div')
    document.body.appendChild(container)
    container.innerHTML = html
    const clientIds: string[] = []
    hydrateRoot(container, tree(recorder(clientIds)))
    expect(clientIds).toEqual(serverIds)
    container.remove()
  })
})
