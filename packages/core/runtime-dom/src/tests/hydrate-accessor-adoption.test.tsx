/**
 * Reactive-accessor ADOPTION during hydration.
 *
 * A function child's SSR output is bracketed by `<!--$-->…<!--/$-->`, EXCEPT
 * when it is an element's only child — then #2935 elides the markers because
 * the tag boundary already is the extent. Hydration therefore has TWO accessor
 * paths, `hydrateReactiveChild` (marked) and `hydrateSoleAccessorChild`
 * (elided), and before this behaviour BOTH general cases (anything other than a
 * single text node) deleted their range and re-mounted — so an accessor's whole
 * subtree was rebuilt on every hydration. `@pyreon/zero` renders its route
 * through exactly such an accessor, which meant a zero app discarded its entire
 * server-rendered page on every load (docs production build: 10 of 11,514
 * `<body>` nodes retained).
 *
 * `RouterView` returns `h('div', …, child)`, so zero's route is a SOLE accessor
 * child and takes the elided path. Adopting in only one of the two leaves zero
 * at 0.1% — measured — which is why both are covered below rather than leaving
 * the marked path to the parity fuzz alone.
 *
 * These specs lock the three properties that make adoption correct:
 *   1. IDENTITY  — the server's element is the SAME node afterwards, so focus
 *                  and typed input survive.
 *   2. LIVENESS  — a later emission still replaces it, leaving nothing behind.
 *   3. DEFERENCE — the CLIENT's first render stays the source of truth. If it
 *                  renders nothing, the server's range is still dropped;
 *                  adoption only narrows the case where the two AGREE. This is
 *                  why a `lazy()` host must resolve before hydrating, which is
 *                  what zero's `startClient` preload does.
 * Plus the nested-accessor cleanup the parity fuzzer's O3 oracle caught.
 */
import type { VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { disableHydrationWarnings, hydrateRoot, mount } from '../index'

const strip = (s: string) => s.replace(/<!--[\s\S]*?-->/g, '')

function mountHost(html: string): HTMLElement {
  const c = document.createElement('div')
  document.body.appendChild(c)
  c.innerHTML = html
  return c
}

describe('hydration — reactive accessor adoption', () => {
  beforeAll(() => disableHydrationWarnings())

  it('ADOPTS the server subtree for an accessor whose initial render is a VNode', async () => {
    const show = signal(true)
    const tree = () => h('main', null, () => (show() ? h('p', { id: 'kept' }, 'server') : null))

    const html = await renderToString(tree() as never)
    const c = mountHost(html)
    const before = c.querySelector('#kept')
    expect(before).not.toBeNull()

    const cleanup = hydrateRoot(c, tree() as never)
    // The SAME element object, not a replacement carrying the same markup.
    expect(c.querySelector('#kept')).toBe(before)
    cleanup()
    c.remove()
  })

  it('ADOPTS through the MARKER path too — an accessor with static siblings', async () => {
    // The specs around this one all give the element a SOLE accessor child,
    // which SSR emits WITHOUT `<!--$-->…<!--/$-->` (the tag boundary is the
    // extent) and hydration routes through `hydrateSoleAccessorChild`. Static
    // siblings force the MARKED path instead, so both adopting code paths are
    // locked here rather than leaving one to the fuzz alone.
    const show = signal(true)
    const tree = () =>
      h(
        'main',
        null,
        h('span', { id: 'before' }, 'B'),
        () => (show() ? h('p', { id: 'mid' }, 'server') : null),
        h('span', { id: 'after' }, 'A'),
      )

    const html = await renderToString(tree() as never)
    expect(html).toContain('<!--$-->') // the marked path, not the elided one
    const c = mountHost(html)
    const mid = c.querySelector('#mid')
    const before = c.querySelector('#before')
    const after = c.querySelector('#after')

    const cleanup = hydrateRoot(c, tree() as never)
    expect(c.querySelector('#mid')).toBe(mid)
    // Siblings must keep their identity AND their order — a cursor that
    // over-runs the accessor's range corrupts exactly this.
    expect(c.querySelector('#before')).toBe(before)
    expect(c.querySelector('#after')).toBe(after)
    expect([...c.querySelectorAll('span,p')].map((e) => e.id)).toEqual(['before', 'mid', 'after'])
    cleanup()
    c.remove()
  })

  it('preserves node IDENTITY through hydration — a focused input keeps focus', async () => {
    const on = signal(true)
    const tree = () => h('main', null, () => (on() ? h('input', { id: 'field' }) : null))

    const html = await renderToString(tree() as never)
    const c = mountHost(html)
    const input = c.querySelector('#field') as HTMLInputElement
    input.value = 'typed by the user'
    input.focus()

    const cleanup = hydrateRoot(c, tree() as never)
    // Identity is the whole product of hydration: a rebuilt input would lose
    // both of these, which is what a user actually notices.
    expect(c.querySelector('#field')).toBe(input)
    expect((c.querySelector('#field') as HTMLInputElement).value).toBe('typed by the user')
    cleanup()
    c.remove()
  })

  it('still REPLACES cleanly on a later emission — no adopted leftovers', async () => {
    const show = signal(true)
    const tree = (s: typeof show) => h('main', null, () => (s() ? h('p', null, 'A') : h('b', null, 'B')))

    const html = await renderToString(tree(show) as never)
    const c = mountHost(html)
    const cleanup = hydrateRoot(c, tree(show) as never)

    // A client-only mount of the same shape is the ground truth.
    const showB = signal(true)
    const cb = document.createElement('div')
    document.body.appendChild(cb)
    const cleanupB = mount(tree(showB) as never, cb)

    show.set(false)
    showB.set(false)
    expect(strip(c.innerHTML)).toBe(strip(cb.innerHTML))
    expect(c.querySelectorAll('p').length).toBe(0)

    show.set(true)
    showB.set(true)
    expect(strip(c.innerHTML)).toBe(strip(cb.innerHTML))

    cleanup()
    cleanupB()
    c.remove()
    cb.remove()
  })

  it('the CLIENT render stays the source of truth when the two disagree', async () => {
    // Server rendered content; the client's first render is `null` — a genuine
    // divergence (and the shape a `lazy()` route shows before its chunk lands).
    // Adoption must NOT keep server DOM the client did not ask for: the range is
    // dropped, exactly as before adoption existed. This is why a lazy host has
    // to resolve its component BEFORE hydrating (zero's `startClient` preloads).
    const serverTree = h('main', null, () => h('p', { id: 'late' }, 'content'))
    const html = await renderToString(serverTree as never)
    const c = mountHost(html)
    expect(c.querySelector('#late')).not.toBeNull()

    const clientReady = signal(false)
    const cleanup = hydrateRoot(
      c,
      h('main', null, () => (clientReady() ? h('p', { id: 'late' }, 'content') : null)) as never,
    )
    expect(c.querySelector('#late')).toBeNull()

    // And the binding is still live — a later flip mounts fresh, exactly once.
    clientReady.set(true)
    expect(c.querySelectorAll('#late').length).toBe(1)
    cleanup()
    c.remove()
  })

  it('a NESTED accessor does not leave its adopted text behind (fuzz O3)', async () => {
    // `<!--$--><!--$-->x<!--/$--><!--/$-->` — the outer accessor adopts a range
    // whose content is the inner accessor's adopted TEXT node. When the outer
    // re-emits, that text must go with it; `bindPolymorphicText` alone disposes
    // the binding without removing the node.
    const outer = signal(true)
    // The cast is the same one `RouterView` documents: an accessor returning a
    // `(() => string) | VNode` union matches no `h()` overload in rest position.
    const build = (o: typeof outer) =>
      h(
        'main',
        null,
        (() => (o() ? () => 'x' : h('b', null, 'replaced'))) as unknown as VNodeChild,
      )

    const html = await renderToString(build(outer) as never)
    const c = mountHost(html)
    const cleanup = hydrateRoot(c, build(outer) as never)

    const outerB = signal(true)
    const cb = document.createElement('div')
    document.body.appendChild(cb)
    const cleanupB = mount(build(outerB) as never, cb)

    outer.set(false)
    outerB.set(false)
    expect(strip(c.innerHTML)).toBe(strip(cb.innerHTML))
    expect(strip(c.innerHTML)).not.toContain('x<b')

    cleanup()
    cleanupB()
    c.remove()
    cb.remove()
  })
})
