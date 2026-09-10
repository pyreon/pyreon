/**
 * Compiled mount slots meeting their SSR ranges.
 *
 * A `<!>` in a compiled template is one node in the clone and an arbitrary
 * RUN of nodes in the server's DOM, so hydration has to find the range's
 * extent before it can hand the compiled bind a cursor. Accessor ranges NEST —
 * a conditional inside a list inside a conditional is ordinary — so the close
 * marker is found by a depth-aware scan, and matching the first `/$` would end
 * the outer range at the inner one's boundary and hand every node after it to
 * the wrong owner.
 *
 * The whole file compiles REAL JSX through `transformJSX` for both sides:
 * client emit hydrated over the SSR emit's own output. That is not ceremony.
 * The SSR side is what produces the `$` markers the adoption keys on, and
 * feeding `renderToString` a hand-built tree instead models a shape no app
 * emits — the documented way this class of bug hides.
 *
 * What is being protected is retention. A slot whose range cannot be resolved
 * falls back to mounting fresh, which produces a correct-looking page built
 * from scratch: typed input wiped, focus lost, scroll reset, and any listener
 * a non-Pyreon script attached silently gone.
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
  _bindProp,
  _bindText,
  _mountSlot,
  _setAttr,
  _setClass,
  _setStyle,
  _textSlot,
  _tpl,
  hydrateRoot,
} from '../index'
import { bindPolymorphicText } from '../mount'
import { disableHydrationWarnings } from '../hydration-debug'

const RUNTIME_DEPS = {
  _tpl,
  _bind,
  _bindText,
  _bindProp,
  _bindDirect,
  _applyProps,
  _setStyle,
  _setAttr,
  _setClass,
  _mountSlot,
  _textSlot,
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

/** Every element + text node under `host`, document order. */
function snapshot(host: HTMLElement): Node[] {
  const out: Node[] = []
  const walk = document.createTreeWalker(host, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
  for (let n = walk.nextNode(); n; n = walk.nextNode()) out.push(n)
  return out
}

const stripComments = (html: string) => html.replace(/<!--[^>]*-->/g, '')

/** Render the SSR emit, then hydrate the CLIENT emit over it. */
async function ssrThenHydrate(
  source: string,
  globals: Record<string, unknown> = {},
): Promise<{
  host: HTMLElement
  before: Node[]
  retained: () => number
  dispose: () => void
}> {
  const html = await renderToString(h(build(source, globals, true) as never, null) as never)
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  const before = snapshot(host)
  const dispose = hydrateRoot(host, h(build(source, globals, false) as never, null))
  return {
    host,
    before,
    retained: () => {
      const after = new Set(snapshot(host))
      return before.filter((n) => after.has(n)).length
    },
    dispose,
  }
}

const hosts: HTMLElement[] = []
const track = <T extends { host: HTMLElement }>(r: T): T => {
  hosts.push(r.host)
  return r
}

disableHydrationWarnings()

afterEach(() => {
  for (const h of hosts.splice(0)) h.remove()
})

describe('a compiled slot adopts its server range', () => {
  it('adopts a conditional slot whose branch rendered', async () => {
    // The control. Everything below asserts retention, and retention is only
    // meaningful against a case that actually adopts.
    const r = track(
      await ssrThenHydrate(
        'function App() { return <div class="c">{show() && <p class="p">yes</p>}</div> }',
        { show: signal(true) },
      ),
    )
    expect(stripComments(r.host.innerHTML)).toContain('yes')
    expect(r.retained(), 'the server nodes are kept, not rebuilt').toBeGreaterThan(0)
    r.dispose()
  })

  it('adopts a NESTED range without crossing the outer one', async () => {
    // The depth-aware scan. Matching the first `/$` ends the outer range at
    // the inner one's boundary, so every node after it is handed to the wrong
    // owner — and the page still renders, which is why nothing catches it.
    const r = track(
      await ssrThenHydrate(
        'function App() { return <div class="c">{outer() && <section class="s">{inner() && <b class="b">deep</b>}</section>}</div> }',
        { outer: signal(true), inner: signal(true) },
      ),
    )
    const html = stripComments(r.host.innerHTML)
    expect(html).toContain('deep')
    expect(r.host.querySelectorAll('.b').length, 'not duplicated').toBe(1)
    expect(r.retained()).toBeGreaterThan(0)
    r.dispose()
  })

  it('adopts a list slot and keeps every row node', async () => {
    const r = track(
      await ssrThenHydrate(
        'function App() { return <ul class="l">{rows().map((x) => <li class="r">{x}</li>)}</ul> }',
        { rows: signal(['a', 'b', 'c']) },
      ),
    )
    expect(r.host.querySelectorAll('.r').length).toBe(3)
    expect(r.retained(), 'rows adopted rather than rebuilt').toBeGreaterThan(3)
    r.dispose()
  })

  it('adopts an EMPTY range — the branch that rendered nothing', async () => {
    // The server emitted `<!--$--><!--/$-->` with no node between. There is
    // nothing to adopt, and the important half is that the client does not
    // then discard the SIBLINGS while looking for one.
    const r = track(
      await ssrThenHydrate(
        'function App() { return <div class="c"><b class="keep">before</b>{show() && <p>hidden</p>}</div> }',
        { show: signal(false) },
      ),
    )
    expect(r.host.querySelector('.keep')?.textContent, 'the sibling survives').toBe('before')
    expect(stripComments(r.host.innerHTML)).not.toContain('hidden')
    r.dispose()
  })

  it('stays LIVE after adopting — the slot re-renders on a write', async () => {
    // Adoption that costs the binding is worse than a rebuild: the page looks
    // right on load and never updates again.
    const show = signal(true)
    const r = track(
      await ssrThenHydrate(
        'function App() { return <div class="c">{show() && <p class="p">yes</p>}</div> }',
        { show },
      ),
    )
    expect(r.host.querySelector('.p')).not.toBeNull()
    show.set(false)
    expect(r.host.querySelector('.p'), 'the binding is live').toBeNull()
    show.set(true)
    expect(r.host.querySelector('.p')).not.toBeNull()
    r.dispose()
  })

  it('keeps an unkeyed list slot LIVE, rebuilding its rows', async () => {
    // An unkeyed `.map()` has no row identity, so an update rebuilds the rows
    // — which is correct, and is the reason `<For>` exists. Asserted rather
    // than assumed, so a future change that starts preserving identity here
    // has to say so deliberately.
    //
    // (`<For>`'s own hydration identity is covered by
    // `hydrate-for-adoption.test.tsx`, which drives it through the real
    // adoption path rather than this file's slot harness.)
    const rows = signal(['a', 'b'])
    const r = track(
      await ssrThenHydrate(
        'function App() { return <ul class="l">{rows().map((x) => <li class="r">{x}</li>)}</ul> }',
        { rows },
      ),
    )
    rows.set(['a', 'b', 'c'])
    expect(r.host.querySelectorAll('.r').length).toBe(3)
    expect(r.host.textContent).toBe('abc')
    r.dispose()
  })

})

describe('a slot with static siblings', () => {
  it('adopts with content BEFORE it', async () => {
    const r = track(
      await ssrThenHydrate(
        'function App() { return <div class="c"><b class="lead">A</b>{show() && <p class="p">B</p>}</div> }',
        { show: signal(true) },
      ),
    )
    expect(r.host.textContent).toBe('AB')
    expect(r.retained()).toBeGreaterThan(0)
    r.dispose()
  })

  it('keeps sibling ORDER when the slot is in the middle', async () => {
    // A slot's server range is an arbitrary run of nodes, so the sibling after
    // it is only findable by resolving the range's extent. Getting that wrong
    // silently reorders the row.
    const r = track(
      await ssrThenHydrate(
        'function App() { return <div class="c"><b>A</b>{show() && <p>B</p>}<i>C</i></div> }',
        { show: signal(true) },
      ),
    )
    expect(r.host.textContent, 'A then B then C').toBe('ABC')
    r.dispose()
  })

  it('keeps sibling order when the slot rendered NOTHING', async () => {
    const r = track(
      await ssrThenHydrate(
        'function App() { return <div class="c"><b>A</b>{show() && <p>B</p>}<i>C</i></div> }',
        { show: signal(false) },
      ),
    )
    expect(r.host.textContent).toBe('AC')
    r.dispose()
  })

  it('re-renders a middle slot in place, not at the end', async () => {
    // The live half of the spec above: flipping the branch after hydration
    // must put the content back between its siblings.
    const show = signal(false)
    const r = track(
      await ssrThenHydrate(
        'function App() { return <div class="c"><b>A</b>{show() && <p>B</p>}<i>C</i></div> }',
        { show },
      ),
    )
    expect(r.host.textContent).toBe('AC')
    show.set(true)
    expect(r.host.textContent, 'inserted between, not appended').toBe('ABC')
    r.dispose()
  })
})

describe('a slot whose value is not an accessor', () => {
  it('adopts a literal element child', async () => {
    // A non-accessor value installs no reactive boundary, so there is no
    // later render whose cleanup would have to remove these nodes — the walk
    // goes straight at the region.
    const r = track(
      await ssrThenHydrate('function App() { return <div class="c">{literal}</div> }', {
        literal: h('p', { class: 'p' }, 'static'),
      }),
    )
    expect(r.host.querySelector('.p')?.textContent).toBe('static')
    expect(r.host.querySelectorAll('.p').length, 'not duplicated').toBe(1)
    r.dispose()
  })

  it('adopts a literal ARRAY child', async () => {
    const r = track(
      await ssrThenHydrate('function App() { return <ul class="l">{items}</ul> }', {
        items: [h('li', { class: 'r' }, 'one'), h('li', { class: 'r' }, 'two')],
      }),
    )
    expect(r.host.querySelectorAll('.r').length).toBe(2)
    r.dispose()
  })

  it('renders a nullish literal as nothing, keeping its siblings', async () => {
    const r = track(
      await ssrThenHydrate(
        'function App() { return <div class="c"><b class="keep">A</b>{nothing}</div> }',
        { nothing: null },
      ),
    )
    expect(r.host.querySelector('.keep')?.textContent).toBe('A')
    r.dispose()
  })
})

describe('teardown releases what hydration adopted', () => {
  it('removes an adopted slot subtree on dispose', async () => {
    // An adopted node the disposer does not own outlives the root, and the
    // whole point of adoption is that the node was already there — so it is
    // exactly the case where ownership is easy to lose.
    const r = track(
      await ssrThenHydrate(
        'function App() { return <div class="c">{show() && <p class="p">yes</p>}</div> }',
        { show: signal(true) },
      ),
    )
    r.dispose()
    expect(r.host.textContent).toBe('')
  })

  it('removes adopted LIST rows on dispose', async () => {
    const r = track(
      await ssrThenHydrate(
        'function App() { return <ul class="l">{rows().map((x) => <li class="r">{x}</li>)}</ul> }',
        { rows: signal(['a', 'b']) },
      ),
    )
    r.dispose()
    expect(r.host.querySelectorAll('.r').length).toBe(0)
  })

  it('leaves the slot inert after dispose', async () => {
    const show = signal(true)
    const r = track(
      await ssrThenHydrate(
        'function App() { return <div class="c">{show() && <p class="p">yes</p>}</div> }',
        { show },
      ),
    )
    r.dispose()
    expect(() => show.set(false)).not.toThrow()
    expect(r.host.textContent).toBe('')
  })
})

describe('the hydrated tree matches a fresh client render', () => {
  const parity = async (source: string, globals: Record<string, unknown>) => {
    const r = track(await ssrThenHydrate(source, globals))
    const fresh = document.createElement('div')
    document.body.appendChild(fresh)
    hosts.push(fresh)
    const { mount } = await import('../index')
    const stop = mount(h(build(source, globals, false) as never, null), fresh)
    const out = {
      hydrated: stripComments(r.host.innerHTML),
      client: stripComments(fresh.innerHTML),
    }
    stop()
    r.dispose()
    return out
  }

  it('agrees for a taken conditional', async () => {
    // The oracle the parity fuzz uses, applied to the compiled path: whatever
    // adoption did, the result must equal what a client mount would have
    // produced from the same source.
    const { hydrated, client } = await parity(
      'function App() { return <div class="c">{show() && <p class="p">yes</p>}</div> }',
      { show: signal(true) },
    )
    expect(hydrated).toBe(client)
  })

  it('agrees for an UNTAKEN conditional', async () => {
    const { hydrated, client } = await parity(
      'function App() { return <div class="c"><b>A</b>{show() && <p>B</p>}<i>C</i></div> }',
      { show: signal(false) },
    )
    expect(hydrated).toBe(client)
  })

  it('agrees for a list', async () => {
    const { hydrated, client } = await parity(
      'function App() { return <ul class="l">{rows().map((x) => <li class="r">{x}</li>)}</ul> }',
      { rows: signal(['a', 'b', 'c']) },
    )
    expect(hydrated).toBe(client)
  })

  it('agrees for a nested range', async () => {
    const { hydrated, client } = await parity(
      'function App() { return <div class="c">{outer() && <section>{inner() && <b>deep</b>}</section>}</div> }',
      { outer: signal(true), inner: signal(true) },
    )
    expect(hydrated).toBe(client)
  })

  it('agrees for an EMPTY list', async () => {
    const { hydrated, client } = await parity(
      'function App() { return <ul class="l">{rows().map((x) => <li>{x}</li>)}</ul> }',
      { rows: signal([]) },
    )
    expect(hydrated).toBe(client)
  })
})
