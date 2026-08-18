/**
 * Regression lock — MULTI-ROOT / `.map()`-COMPOSED hydration adoption.
 *
 * `<For>` adopted its rows; the same component list written with `.map()`
 * retained NOTHING — every node rebuilt, with a correct final DOM, so nothing
 * warned. Two independent layers discarded it:
 *
 *  1. `templateSignature` refused every template containing a `<!>` mount-slot
 *     placeholder, so the CONTAINER never adopted; `_mountSlot` then mounted
 *     fresh into the clone and the NativeItem branch replaced the SSR subtree.
 *  2. Even reached directly (an h()-lowered container), the multi-root branch of
 *     `hydrateReactiveChild` mounted fresh and DELETED the whole `<!--$-->…
 *     <!--/$-->` range.
 *
 * Layer 2 is the general one: it governs every multi-root dynamic region, not
 * just `.map()`.
 *
 * SAFETY — a `<!>` is one node in the clone but an arbitrary run in the SSR DOM,
 * so any compiled ref walk that steps PAST it lands on slot content instead of
 * the node it names (the ref-hoist misbinding class). Adoption is therefore
 * gated on every slot being its parent's LAST child, which cannot be crossed.
 * `<div><!><!></div>` and `<div><!><footer/></div>` bail to the clone — the
 * pre-existing behaviour. The `does NOT adopt` specs lock that.
 *
 * Every spec compiles REAL JSX through `transformJSX` for BOTH sides — client
 * emit hydrated over the SSR emit's own output — because the SSR side is what
 * produces the `$` range markers the adoption keys on. Feeding `renderToString`
 * a hand-built array instead models a shape no app emits and hides the bug.
 *
 * Bisect: reverting the `templateSignature` slot gate returns map-composed to
 * 0/N; reverting the `hydrateReactiveChild` multi-root adoption returns the
 * h()-container shape to 3/N and map-composed to 0/N.
 */
import { transformJSX } from '@pyreon/compiler'
import { For, Fragment, h } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import {
  _applyProps,
  _bindDirect,
  _bindText,
  _mountSlot,
  _setAttr,
  _setClass,
  _setStyle,
  _tpl,
  hydrateRoot,
} from '../index'
import { bindPolymorphicText } from '../mount'

// ─── Real-transform harness ──────────────────────────────────────────────────
const RUNTIME_DEPS = {
  _tpl,
  _bind,
  _bindText,
  _bindDirect,
  _applyProps,
  _setStyle,
  _setAttr,
  _setClass,
  _mountSlot,
  bindPolymorphicText,
  h,
  Fragment,
  For,
  signal,
}
const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)

const lowerResidualJsx = (code: string) =>
  transformSync(code, {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code

function build(source: string, globals: Record<string, unknown>, ssr: boolean): () => unknown {
  const { code } = ssr
    ? transformJSX(source, 'test.tsx', { ssr: true })
    : transformJSX(source, 'test.tsx')
  const body = lowerResidualJsx(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''))
  const fn = new Function(...DEP_NAMES, ...Object.keys(globals), `${body}\nreturn App`)
  return fn(...DEP_VALUES, ...Object.values(globals)) as () => unknown
}

/** Render the SSR emit of `source`, then hydrate its CLIENT emit over it. */
async function ssrThenHydrate(
  source: string,
  globals: Record<string, unknown> = {},
): Promise<{ host: HTMLElement; before: Node[]; dispose: () => void }> {
  const html = await renderToString(h(build(source, globals, true) as never, null) as never)
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  const before = snapshot(host)
  const dispose = hydrateRoot(host, h(build(source, globals, false) as never, null))
  return { host, before, dispose }
}

/** Every element + text node under `host`, document order. */
function snapshot(host: HTMLElement): Node[] {
  const out: Node[] = []
  const walk = document.createTreeWalker(host, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
  for (let n = walk.nextNode(); n; n = walk.nextNode()) out.push(n)
  return out
}

/** Reactive boundaries anchor on `<!--pyreon-->` comments — present in both the
 * adopted and the fall-back-to-clone paths, and invisible to the user. The
 * parity fuzzer strips them for the same reason. */
const stripComments = (html: string) => html.replace(/<!--[^>]*-->/g, '')

/** How many of the pre-hydration nodes are still in the tree afterwards. */
function retained(before: Node[], host: HTMLElement): number {
  const after = new Set(snapshot(host))
  return before.filter((n) => after.has(n)).length
}

afterEach(() => {
  document.body.innerHTML = ''
})

const ITEMS = Array.from({ length: 8 }, (_, i) => ({ id: i, title: `t${i}`, body: `b${i}` }))
const Card = (p: { item: { id: number; title: string; body: string } }) =>
  h('article', { class: 'card' }, h('h3', null, p.item.title), h('p', null, p.item.body))
const G = { ITEMS, Card }
/** 1 container + 8 × (article + h3 + text + p + text). */
const ALL = 1 + ITEMS.length * 5

describe('map-composed hydration adoption — node retention census', () => {
  it('a `.map()` of components retains EVERY node (was 0/N)', async () => {
    const { host, before, dispose } = await ssrThenHydrate(
      `const App = () => <div class="list">{ITEMS.map((i) => <Card item={i} />)}</div>`,
      G,
    )
    expect(before).toHaveLength(ALL)
    expect(retained(before, host)).toBe(ALL)
    // …and the markers are consumed, leaving the DOM a client mount would build.
    expect(stripComments(host.innerHTML)).toBe(
      `<div class="list">${ITEMS.map(
        (i) => `<article class="card"><h3>${i.title}</h3><p>${i.body}</p></article>`,
      ).join('')}</div>`,
    )
    dispose()
  })

  it('the same list under `<For>` still retains everything (no regression)', async () => {
    const { host, before, dispose } = await ssrThenHydrate(
      `const App = () => <div class="list"><For each={ITEMS} by={(i) => i.id}>{(i) => <Card item={i} />}</For></div>`,
      G,
    )
    expect(before).toHaveLength(ALL)
    expect(retained(before, host)).toBe(ALL)
    dispose()
  })

  it('a `.map()` under an h()-lowered container retains everything (was 3/N)', async () => {
    // A component sibling makes the template emitter bail, so the container
    // lowers to h() and the slot arrives at hydrateReactiveChild directly —
    // layer 2 on its own.
    const { host, before, dispose } = await ssrThenHydrate(
      `const App = () => <div class="list"><Header/>{ITEMS.map((i) => <Card item={i} />)}</div>`,
      { ...G, Header: () => h('h2', null, 'Title') },
    )
    expect(before).toHaveLength(ALL + 2) // + <h2> + its text
    expect(retained(before, host)).toBe(ALL + 2)
    dispose()
  })

  it('a slot with a STATIC SIBLING BEFORE it adopts (walk stops at the marker)', async () => {
    const { host, before, dispose } = await ssrThenHydrate(
      `const App = () => <div class="list"><h2>Title</h2>{ITEMS.map((i) => <Card item={i} />)}</div>`,
      G,
    )
    expect(retained(before, host)).toBe(ALL + 2)
    dispose()
  })

  it('a NESTED only-child slot adopts (ref walk reaches the inner element)', async () => {
    const { host, before, dispose } = await ssrThenHydrate(
      `const App = () => <section class="s"><ul class="list">{ITEMS.map((i) => <Card item={i} />)}</ul></section>`,
      G,
    )
    expect(retained(before, host)).toBe(ALL + 1) // + <section>
    dispose()
  })

  // ── The shapes that must NOT adopt ──────────────────────────────────────────
  // Two slots in ONE parent: the compiled ref for the second is
  // `__root.firstChild.nextSibling`, which in the SSR DOM is the FIRST slot's
  // content. Adopting would bind the second slot against the first one's nodes.

  it('does NOT adopt two slots in one parent — and stays CORRECT by falling back', async () => {
    const A1 = ITEMS.slice(0, 3)
    const A2 = ITEMS.slice(3, 6)
    const { host, dispose } = await ssrThenHydrate(
      `const App = () => <div class="list">{A1.map((i) => <Card item={i} />)}{A2.map((i) => <Card item={i} />)}</div>`,
      { A1, A2, Card },
    )
    // The whole point of the bail: the rendered result is still exactly right.
    expect(stripComments(host.innerHTML)).toBe(
      `<div class="list">${[...A1, ...A2]
        .map((i) => `<article class="card"><h3>${i.title}</h3><p>${i.body}</p></article>`)
        .join('')}</div>`,
    )
    dispose()
  })

  it('does NOT adopt a slot followed by a static sibling — and stays CORRECT', async () => {
    const { host, dispose } = await ssrThenHydrate(
      `const App = () => <div class="list">{ITEMS.map((i) => <Card item={i} />)}<footer>f</footer></div>`,
      G,
    )
    expect(stripComments(host.innerHTML)).toBe(
      `<div class="list">${ITEMS.map(
        (i) => `<article class="card"><h3>${i.title}</h3><p>${i.body}</p></article>`,
      ).join('')}<footer>f</footer></div>`,
    )
    dispose()
  })
})

describe('map-composed adoption — state, reactivity and safety', () => {
  it('PRESERVES user state living on the server nodes (typed value + focus)', async () => {
    const ROWS = [{ id: 1 }, { id: 2 }]
    const Row = (p: { item: { id: number } }) =>
      h('label', null, h('input', { name: `q${p.item.id}`, type: 'text' }))
    const SRC = `const App = () => <form class="f">{ROWS.map((i) => <Row item={i} />)}</form>`
    const html = await renderToString(h(build(SRC, { ROWS, Row }, true) as never, null) as never)
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.appendChild(host)

    // The user starts typing into the second row before the bundle boots.
    const input = host.querySelectorAll('input')[1] as HTMLInputElement
    input.value = 'typed before hydration'
    input.focus()
    expect(document.activeElement).toBe(input)

    const dispose = hydrateRoot(host, h(build(SRC, { ROWS, Row }, false) as never, null))

    const after = host.querySelectorAll('input')[1] as HTMLInputElement
    expect(after).toBe(input) // adopted, not rebuilt
    expect(after.value).toBe('typed before hydration')
    expect(document.activeElement).toBe(after)
    dispose()
  })

  it('an adopted slot stays REACTIVE — the list re-renders on a signal flip', async () => {
    const items = signal([{ id: 1, label: 'one' }])
    const Row = (p: { item: { id: number; label: string } }) => h('li', null, p.item.label)
    const SRC = `const App = () => <ul class="l">{items().map((i) => <Row item={i} />)}</ul>`
    const { host, before, dispose } = await ssrThenHydrate(SRC, { items, Row })

    expect(retained(before, host)).toBe(before.length)
    expect(host.querySelectorAll('li')).toHaveLength(1)

    items.set([
      { id: 1, label: 'one' },
      { id: 2, label: 'two' },
    ])
    const lis = host.querySelectorAll('li')
    expect(lis).toHaveLength(2)
    expect(lis[1]?.textContent).toBe('two')
    dispose()
  })

  it('a flip AWAY from the adopted content leaves nothing behind', async () => {
    // The contract bridge: hydrateChild disposes bindings, mountReactive needs
    // the nodes GONE before the next render. The parity fuzzer caught an adopted
    // text node surviving every future flip; this locks the shape directly.
    const show = signal(true)
    const SRC = `const App = () => <div class="w">{show() ? ITEMS.map((i) => <Card item={i} />) : null}</div>`
    const { host, dispose } = await ssrThenHydrate(SRC, { ...G, show })
    expect(host.querySelectorAll('article')).toHaveLength(ITEMS.length)

    show.set(false)
    expect(host.querySelectorAll('article')).toHaveLength(0)
    expect(host.querySelector('.w')?.textContent).toBe('')

    show.set(true)
    expect(host.querySelectorAll('article')).toHaveLength(ITEMS.length)
    dispose()
  })

  it('does NOT let a local slot template STEAL the root SSR node', async () => {
    // #2918's hazard, now for slot-bearing templates: arguments evaluate before
    // the call, so a template built in an earlier statement reaches the armed
    // one-shot slot first. It must not come back wearing the root's identity.
    const SRC = `const App = () => {
      const other = <div class="other">{A2.map((i) => <Card item={i} />)}</div>
      return h('div', { class: 'root' }, other)
    }`
    const A2 = [{ id: 9, title: 'x', body: 'y' }]
    const html = await renderToString(
      h(build(SRC, { A2, Card }, true) as never, null) as never,
    )
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.appendChild(host)
    const dispose = hydrateRoot(host, h(build(SRC, { A2, Card }, false) as never, null))

    // The root keeps its own class and the inner keeps its own — no swap.
    const root = host.firstElementChild as HTMLElement
    expect(root.className).toBe('root')
    expect(root.firstElementChild?.className).toBe('other')
    expect(host.querySelectorAll('article')).toHaveLength(1)
    dispose()
  })
})
