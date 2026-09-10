/**
 * What hydration does when the server DOM and the client render disagree.
 *
 * A mismatch is not an exotic state. A date rendered in two timezones, a
 * random id, a feature flag read from a cookie on one side only, a cache
 * serving last deploy's HTML — every one produces a client render that does
 * not match the markup it is handed. React, Vue and Solid all treat this as
 * recoverable, and so does Pyreon.
 *
 * Which makes the recovery PATH the thing worth testing, because its failure
 * mode is not a crash. Two shapes have shipped from here:
 *
 *  - recovering at the PARENT anchor instead of at the cursor, which appends
 *    the corrected node at the end and silently reorders every sibling after
 *    the mismatch;
 *  - leaving the server's node in place beside the corrected one, so the page
 *    renders both — the "dead server DOM" class.
 *
 * Neither throws, and both produce a page that is visibly almost right. So
 * every spec here asserts the FINAL DOM and the sibling order, not just that
 * something was reported.
 *
 * The telemetry hook is the other half: `onHydrationMismatch` is what a
 * production app forwards to Sentry, and it fires in production where the
 * console warning does not. A recovery that silently succeeds is a bug that
 * never gets reported.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { hydrateRoot } from '../hydrate'
import {
  disableHydrationWarnings,
  enableHydrationWarnings,
  onHydrationMismatch,
} from '../hydration-debug'
import type { HydrationMismatchContext } from '../hydration-debug'
import { query } from '@pyreon/test-utils'

let container: HTMLElement
let seen: HydrationMismatchContext[]
let offMismatch: () => void

/** Server markup, then hydrate the given tree against it. */
function ssrThenHydrate(html: string, vnode: ReturnType<typeof h>): () => void {
  container.innerHTML = html
  return hydrateRoot(container, vnode)
}

/** The container's text with whitespace-only nodes preserved. */
const text = () => container.textContent ?? ''

/** Tag names of the container's element children, in order. */
const tags = () => [...container.children].map((e) => e.tagName.toLowerCase())

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  seen = []
  offMismatch = onHydrationMismatch((ctx) => seen.push(ctx))
  disableHydrationWarnings() // the console noise is a separate surface
})
afterEach(() => {
  offMismatch()
  container.remove()
  vi.restoreAllMocks()
})

describe('a matching tree reports nothing and adopts the server nodes', () => {
  it('adopts identical markup with no mismatch at all', () => {
    // The control for the entire file. Every "reports a mismatch" assertion
    // below is worthless against a hydrator that reports one for everything,
    // and every "recovers correctly" assertion is worthless against one that
    // rebuilds the page regardless.
    container.innerHTML = '<p>hello</p>'
    const serverP = container.firstElementChild
    const dispose = hydrateRoot(container, h('p', null, 'hello'))
    expect(seen, 'no mismatch on agreeing markup').toEqual([])
    expect(container.firstElementChild, 'and the server node is KEPT').toBe(serverP)
    expect(text()).toBe('hello')
    dispose()
  })

  it('adopts a nested tree without reporting', () => {
    container.innerHTML = '<ul><li><span>a</span></li><li><span>b</span></li></ul>'
    const firstLi = container.querySelector('li')
    const dispose = hydrateRoot(
      container,
      h(
        'ul',
        null,
        h('li', null, h('span', null, 'a')),
        h('li', null, h('span', null, 'b')),
      ),
    )
    expect(seen).toEqual([])
    expect(container.querySelector('li')).toBe(firstLi)
    dispose()
  })
})

describe('a TEXT mismatch recovers at the cursor, not at the end', () => {
  it('reports the mismatch with both values and a path', () => {
    // The report is the whole product for a production app: without the
    // expected/actual pair there is nothing to diff against the deploy.
    const dispose = ssrThenHydrate('<p>server</p>', h('p', null, 'client'))
    expect(seen).toHaveLength(1)
    expect(seen[0]?.type).toBe('text')
    expect(seen[0]?.expected).toBe('client')
    expect(seen[0]?.actual).toBe('server')
    expect(seen[0]?.path, 'and say WHERE').toBeTruthy()
    dispose()
  })

  it('renders the CLIENT text FIRST, and leaves the server text after it', () => {
    // Documents the shape exactly, because half of it is a known gap.
    //
    // The client's text is inserted AT THE CURSOR, which is what keeps sibling
    // order correct (the spec below). The server's node is deliberately kept:
    // the NEXT sibling frequently adopts it, and consuming it here would cost
    // that adoption for the common "server had one extra node" case.
    //
    // KNOWN GAP: when no sibling claims it, nothing sweeps it — a static child
    // list has no marker range delimiting its extent the way a reactive
    // accessor does, and inferring the extent from the leftover cursor is not
    // sound (measured: it deletes `dangerouslySetInnerHTML` content and breaks
    // the SSR↔hydrate parity fuzz on 5 of 300 seeds). So a text mismatch
    // renders BOTH values. Fixing it needs explicit claim accounting rather
    // than a cursor heuristic; this spec is what will change when it lands.
    const dispose = ssrThenHydrate('<p>server</p>', h('p', null, 'client'))
    expect(text()).toBe('clientserver')
    dispose()
  })

  it('keeps SIBLING ORDER across the mismatch', () => {
    // The shape that shipped: recovering at the parent anchor appends the
    // corrected node after everything, so a mismatch in the middle silently
    // moves it to the end. Visibly almost right, and completely wrong.
    const dispose = ssrThenHydrate(
      '<p><b>one</b>SERVER<i>three</i></p>',
      h('p', null, h('b', null, 'one'), 'two', h('i', null, 'three')),
    )
    // The CLIENT's three children, in the client's order, contiguously. The
    // unclaimed server tail follows (the known gap above) — what must never
    // happen is a client node landing after it.
    expect(container.firstElementChild?.textContent).toBe('onetwothreeSERVERthree')
    dispose()
  })

  it('recovers a mismatch on the FIRST of several children', () => {
    const dispose = ssrThenHydrate(
      '<p>WRONG<b>b</b><i>c</i></p>',
      h('p', null, 'a', h('b', null, 'b'), h('i', null, 'c')),
    )
    const rendered = container.firstElementChild?.textContent ?? ''
    expect(rendered.startsWith('abc'), `client order first, got ${rendered}`).toBe(true)
    dispose()
  })

  it('adopts a MERGED text node by splitting it', () => {
    // The parser joins `{'2'}{'3'}` into one `23` node, so the first child
    // must take its prefix and leave the rest at the cursor. Treating this as
    // a mismatch would report one on markup that is perfectly correct.
    const dispose = ssrThenHydrate('<p>23</p>', h('p', null, '2', '3'))
    expect(seen, 'a merged node is not a mismatch').toEqual([])
    expect(text()).toBe('23')
    dispose()
  })

  it('reports a mismatch when the server text does not even PREFIX the client text', () => {
    const dispose = ssrThenHydrate('<p>xy</p>', h('p', null, 'a', 'b'))
    expect(seen.length).toBeGreaterThan(0)
    expect(text().startsWith('ab'), 'the client values lead').toBe(true)
    dispose()
  })

  it('recovers when the server put an ELEMENT where text belongs', () => {
    // A different node KIND, which is the case a text-vs-text compare cannot
    // see. The report has to name the kind, or the reader goes looking for a
    // string difference that does not exist.
    const dispose = ssrThenHydrate('<p><b>x</b></p>', h('p', null, 'x'))
    expect(seen.length).toBeGreaterThan(0)
    expect(seen[0]?.expected).toBe('TextNode')
    expect(container.firstElementChild?.textContent).toContain('x')
    dispose()
  })

  it('recovers when the server emitted NOTHING where text belongs', () => {
    const dispose = ssrThenHydrate('<p></p>', h('p', null, 'x'))
    expect(seen.length).toBeGreaterThan(0)
    expect(text()).toBe('x')
    dispose()
  })
})

describe('a REACTIVE text mismatch recovers and stays live', () => {
  it('adopts a matching value with no report, and stays reactive', () => {
    // The control: recovery must not cost the binding. A corrected node that
    // is not bound renders once and then freezes — worse than the mismatch.
    const s = signal('a')
    const dispose = ssrThenHydrate('<p>a</p>', h('p', null, () => s()))
    expect(seen).toEqual([])
    s.set('b')
    expect(text()).toBe('b')
    dispose()
  })

  it('reports and recovers a diverged initial value, and stays reactive', () => {
    // The timezone/random-id shape: the value genuinely differs between the
    // two renders. The client's value wins and the binding survives.
    const s = signal('client')
    const dispose = ssrThenHydrate('<p>server</p>', h('p', null, () => s()))
    expect(seen.length).toBeGreaterThan(0)
    expect(text()).toBe('client')
    s.set('later')
    expect(text(), 'the recovered node must still be bound').toBe('later')
    dispose()
  })

  it('binds an EMPTY initial value without consuming a server node', () => {
    // An accessor rendering '' emits no SSR node at all, so there is nothing
    // to adopt and nothing to consume. Falling through to the mismatch branch
    // would swallow the NEXT sibling's node and shift the whole tail.
    const s = signal('')
    const dispose = ssrThenHydrate(
      '<p><b>tail</b></p>',
      h('p', null, () => s(), h('b', null, 'tail')),
    )
    expect(container.querySelector('b')?.textContent, 'the sibling survives').toBe('tail')
    s.set('now')
    expect(text(), 'and the empty binding is live').toBe('nowtail')
    dispose()
  })

  it('recovers when a reactive slot met an ELEMENT', () => {
    const s = signal('v')
    const dispose = ssrThenHydrate('<p><b>x</b></p>', h('p', null, () => s()))
    expect(seen.length).toBeGreaterThan(0)
    s.set('w')
    expect(text()).toContain('w')
    dispose()
  })

  it('adopts a reactive value that PREFIXES a merged server node', () => {
    const s = signal('ab')
    const dispose = ssrThenHydrate('<p>abcd</p>', h('p', null, () => s(), 'cd'))
    expect(seen, 'a prefix match is not a mismatch').toEqual([])
    s.set('AB')
    expect(text()).toBe('ABcd')
    dispose()
  })
})

describe('a TAG mismatch is reported as a tag mismatch', () => {
  it('names the expected and actual tags', () => {
    // Reported as `tag`, not `text`: the remedy is completely different, and
    // a mis-typed report sends the reader to the wrong half of their render.
    const dispose = ssrThenHydrate('<span>x</span>', h('div', null, 'x'))
    const tag = seen.find((s) => s.type === 'tag')
    expect(tag, 'a tag mismatch must be reported as one').toBeTruthy()
    expect(tag?.expected).toBe('div')
    expect(tag?.actual).toBe('span')
    dispose()
  })

  it('puts the CLIENT element FIRST', () => {
    // The fix this spec locks: recovery mounts at the CURSOR. It used to mount
    // at the parent-level anchor — which for an element's children is the END
    // of the list — so a tag mismatch in the middle silently moved the
    // client's node past every following sibling. Order was lost while every
    // node-level assertion still passed.
    //
    // The trailing server element is the same known gap named above.
    const dispose = ssrThenHydrate('<span>x</span>', h('div', null, 'x'))
    expect(tags()[0], 'the client element leads').toBe('div')
    expect(container.firstElementChild?.textContent).toBe('x')
    dispose()
  })

  it('keeps the CLIENT children contiguous and in order, ahead of the residue', () => {
    // Before the cursor fix this rendered `span, i, b, i` — the client's two
    // elements appended AFTER both server nodes. It now renders `b, i` first,
    // which is the half that matters for a reader and for `querySelector`:
    // the live node is the one found first, not a dead server copy in front of
    // it. That ordering is precisely what made the `useDelete` e2e click a
    // button with no handler on it.
    const dispose = ssrThenHydrate(
      '<div><span>a</span><i>b</i></div>',
      h('div', null, h('b', null, 'a'), h('i', null, 'b')),
    )
    const inner = container.firstElementChild!
    const kids = [...inner.children].map((e) => e.tagName.toLowerCase())
    expect(kids.slice(0, 2), 'the client pair leads').toEqual(['b', 'i'])
    dispose()
  })

  it('keeps hydrating the REST of the tree after a tag mismatch', () => {
    // A mismatch is per-node. Abandoning the walk would leave everything after
    // it unhydrated — the page renders and nothing is interactive.
    const clicks: number[] = []
    const dispose = ssrThenHydrate(
      '<div><span>a</span><button>go</button></div>',
      h(
        'div',
        null,
        h('b', null, 'a'),
        h('button', { onClick: () => clicks.push(1) }, 'go'),
      ),
    )
    ;(query(container, 'button')).click()
    expect(clicks, 'the sibling after the mismatch is still bound').toEqual([1])
    dispose()
  })
})

describe('the reporting surfaces are independent', () => {
  it('fires the telemetry hook even with console warnings DISABLED', () => {
    // A production app forwards to Sentry without turning on the noisy dev
    // console. Coupling the two would mean production reports nothing.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    disableHydrationWarnings()
    const dispose = ssrThenHydrate('<p>a</p>', h('p', null, 'b'))
    expect(seen.length, 'telemetry still fires').toBeGreaterThan(0)
    expect(warn, 'and the console stays quiet').not.toHaveBeenCalled()
    warn.mockRestore()
    dispose()
  })

  it('warns on the console when warnings are ENABLED', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    enableHydrationWarnings()
    const dispose = ssrThenHydrate('<p>a</p>', h('p', null, 'b'))
    expect(warn).toHaveBeenCalled()
    disableHydrationWarnings()
    warn.mockRestore()
    dispose()
  })

  it('stops reporting to a handler once it unregisters', () => {
    // The hook returns an unregister function; a handler that keeps firing
    // after teardown retains whatever it closed over for the page's life.
    const local: HydrationMismatchContext[] = []
    const off = onHydrationMismatch((c) => local.push(c))
    ssrThenHydrate('<p>a</p>', h('p', null, 'b'))()
    const afterFirst = local.length
    expect(afterFirst).toBeGreaterThan(0)
    off()
    ssrThenHydrate('<p>c</p>', h('p', null, 'd'))()
    expect(local.length, 'no deliveries after unregister').toBe(afterFirst)
  })

  it('delivers to SEVERAL handlers', () => {
    const a: unknown[] = []
    const b: unknown[] = []
    const offA = onHydrationMismatch(() => a.push(1))
    const offB = onHydrationMismatch(() => b.push(1))
    ssrThenHydrate('<p>x</p>', h('p', null, 'y'))()
    expect(a.length).toBeGreaterThan(0)
    expect(b.length).toBeGreaterThan(0)
    offA()
    offB()
  })
})

describe('a list mismatch does not corrupt the rest of the list', () => {
  it('hydrates a For whose server rows match', () => {
    // The control for the two below.
    const items = signal([{ id: 1, label: 'a' }, { id: 2, label: 'b' }])
    container.innerHTML =
      '<ul><!--pyreon-for--><!--k:1--><li>a</li><!--k:2--><li>b</li><!--/pyreon-for--></ul>'
    const dispose = hydrateRoot(
      container,
      h(
        'ul',
        null,
        h(For as never, {
          each: () => items(),
          by: (r: { id: number }) => r.id,
          children: (r: { label: string }) => h('li', null, r.label),
        }),
      ),
    )
    expect(container.querySelectorAll('li').length).toBe(2)
    expect(text()).toContain('a')
    dispose()
  })

  it('still renders every row when the server markers are unusable', () => {
    // A truncated or reordered marker block means the range cannot be parsed.
    // The recovery is to build the list — losing adoption, not the rows.
    const items = signal([{ id: 1, label: 'a' }, { id: 2, label: 'b' }])
    container.innerHTML = '<ul><li>a</li><li>b</li></ul>'
    const dispose = hydrateRoot(
      container,
      h(
        'ul',
        null,
        h(For as never, {
          each: () => items(),
          by: (r: { id: number }) => r.id,
          children: (r: { label: string }) => h('li', null, r.label),
        }),
      ),
    )
    expect(container.querySelectorAll('li').length, 'both rows present').toBe(2)
    expect(text()).toContain('a')
    expect(text()).toContain('b')
    dispose()
  })

  it('keeps the list reactive after a marker-parse failure', () => {
    // The failure mode worth naming: a list that renders correctly once and
    // never updates looks fine on load and is dead thereafter.
    const items = signal([{ id: 1, label: 'a' }])
    container.innerHTML = '<ul><li>a</li></ul>'
    const dispose = hydrateRoot(
      container,
      h(
        'ul',
        null,
        h(For as never, {
          each: () => items(),
          by: (r: { id: number }) => r.id,
          children: (r: { label: string }) => h('li', null, r.label),
        }),
      ),
    )
    items.set([{ id: 1, label: 'a' }, { id: 2, label: 'b' }])
    expect(container.querySelectorAll('li').length, 'the list must still update').toBe(2)
    dispose()
  })
})

describe('teardown after a recovery', () => {
  it('removes everything hydration INSERTED, leaving only the server residue', () => {
    // A recovered node the dispose path does not own outlives the root, and a
    // mismatch is exactly when extra nodes get created.
    //
    // The residue goes with it here because the ADOPTED `<p>` is the root
    // vnode, and disposing an element removes the element — children and all.
    // So the leftover only survives while the page is live, which is exactly
    // when it is visible.
    const dispose = ssrThenHydrate('<p>server</p>', h('p', null, 'client'))
    expect(text(), 'both values while live').toBe('clientserver')
    dispose()
    expect(container.textContent, 'and nothing after teardown').toBe('')
  })

  it('removes the client tree after a TAG recovery', () => {
    const dispose = ssrThenHydrate('<span>x</span>', h('div', null, 'x'))
    dispose()
    expect(tags(), 'the client element is gone; the unclaimed server node is not ours').toEqual([
      'span',
    ])
  })

  it('disposes a reactive binding created during recovery', () => {
    const s = signal('client')
    const dispose = ssrThenHydrate('<p>server</p>', h('p', null, () => s()))
    dispose()
    expect(() => s.set('after')).not.toThrow()
    expect(container.textContent).toBe('')
  })
})
