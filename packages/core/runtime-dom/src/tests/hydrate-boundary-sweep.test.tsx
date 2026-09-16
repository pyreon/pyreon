/**
 * Server DOM the client did not claim must be GONE when hydration returns —
 * at the element boundary and at the root, not only inside a marked accessor
 * range.
 *
 * #3351 taught `adoptReactiveRange` to sweep its own extent, and #3466 relied
 * on that for the mismatch path. `hydrateElement`'s tag-mismatch recovery then
 * shipped with a comment saying the node it deliberately leaves behind is
 * "swept at the element/root boundary, where the extent is known" — offering it
 * to the next sibling, which frequently adopts it. No such sweep existed:
 * `hydrateElement` destructured `[childCleanup] = hydrateChildren(...)` and
 * DISCARDED the residual cursor, and `hydrateRoot` did the same with
 * `hydrateChild`. So a tag mismatch nothing downstream claimed, a static text
 * mismatch, or simply MORE children on the server than on the client left that
 * DOM standing: `<div><b>a</b><i>a</i></div>` where a fresh mount gives
 * `<div><b>a</b></div>`. Visible, countable, and carrying no handler — the same
 * class #3466 fixed one layer in. React and Vue both delete the extra
 * hydratable nodes.
 *
 * THE ORACLE IS PARITY, not a hand-written expectation: hydrate a client tree
 * over the server's HTML, mount the SAME client tree cold, and require the two
 * DOMs to be identical. A hand-written expectation can only ever encode what
 * the author believed; parity is what a user experiences as "the page is the
 * same whether I landed here or navigated here".
 *
 * The parity fuzz cannot see any of this — its O1 oracle is ZERO mismatches, so
 * every cell below is outside its grammar by construction.
 *
 * Bisect (per cell, each verified): reverting `sweepUnclaimed`'s call in
 * `hydrateElement` fails the five element cells (e.g. `expected
 * '<div><b>a</b><i>a</i></div>' to be '<div><b>a</b></div>'`); reverting the
 * `hydrateRoot` call fails the two root cells; reverting the static-text
 * REPLACE fails the identity spec (`expected false to be true`).
 */
import { _fuse, _lc, For, Fragment, h } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import { vi } from 'vitest'
import { renderToString } from '@pyreon/runtime-server'
import { transformJSX } from '@pyreon/compiler'
import { transformSync } from 'esbuild'
import {
  _applyProps,
  _bindDirect,
  _bindProp,
  _bindSpread,
  _bindText,
  _mountChild,
  _mountSlot,
  _setAttr,
  _setChild,
  _setChildAt,
  _setClass,
  _setHtml,
  _setStyle,
  _setValue,
  _textSlot,
  _tpl,
  disableHydrationWarnings,
  hydrateRoot,
  mount,
} from '../index'
import { bindPolymorphicText } from '../mount'
// The sanitized `innerHTML` prop throws without a registered sanitizer (the
// vite-plugin auto-injects this import in a real app).
import '../sanitizer'

const noC = (s: string) => s.replace(/<!--[\s\S]*?-->/g, '')

function host(html = ''): HTMLElement {
  const c = document.createElement('div')
  c.innerHTML = html
  document.body.appendChild(c)
  return c
}

/**
 * The oracle. `server` and `client` are thunks so each arm builds its own
 * signals — a shared instance would let one arm's bindings write the other's.
 * Returns both DOMs plus the hydrated container, so a cell can additionally
 * assert node IDENTITY (parity says the DOM MATCHES; it does not say the
 * server's node was adopted rather than rebuilt).
 */
async function parity(server: () => unknown, client: () => unknown) {
  const html = await renderToString(server() as never)
  const hydrated = host(html)
  const dispose = hydrateRoot(hydrated, client() as never)
  const fresh = host()
  const unmount = mount(client() as never, fresh)
  return {
    html,
    hydrated,
    hyd: noC(hydrated.innerHTML),
    cold: noC(fresh.innerHTML),
    dispose: () => {
      dispose()
      unmount()
    },
  }
}

describe('hydration — unclaimed server DOM is swept at the element and root boundaries', () => {
  beforeAll(() => disableHydrationWarnings())
  afterEach(() => {
    document.body.innerHTML = ''
  })

  // ─── Element boundary ──────────────────────────────────────────────────────

  it('STATIC text mismatch with an element sibling after it', async () => {
    const r = await parity(
      () => h('div', null, 'stale', h('b', null, 'x')),
      () => h('div', null, 'fresh', h('b', null, 'x')),
    )
    expect(r.hyd, 'hydrated must equal a cold mount').toBe(r.cold)
    expect(r.hyd).toBe('<div>fresh<b>x</b></div>')
    r.dispose()
  })

  it('STATIC text mismatch as the LAST child', async () => {
    const r = await parity(
      () => h('div', null, h('b', null, 'x'), 'stale'),
      () => h('div', null, h('b', null, 'x'), 'fresh'),
    )
    expect(r.hyd).toBe(r.cold)
    expect(r.hyd).toBe('<div><b>x</b>fresh</div>')
    r.dispose()
  })

  it('STATIC text mismatch as the SOLE child', async () => {
    const r = await parity(
      () => h('div', null, 'stale'),
      () => h('div', null, 'fresh'),
    )
    expect(r.hyd).toBe(r.cold)
    expect(r.hyd).toBe('<div>fresh</div>')
    r.dispose()
  })

  it('TAG mismatch as the SOLE child', async () => {
    const r = await parity(
      () => h('div', null, h('i', null, 'a')),
      () => h('div', null, h('b', null, 'a')),
    )
    expect(r.hyd).toBe(r.cold)
    expect(r.hyd).toBe('<div><b>a</b></div>')
    r.dispose()
  })

  it('TAG mismatch MID-list, with a matching sibling after it', async () => {
    const r = await parity(
      () => h('div', null, h('i', null, 'a'), h('span', null, 'z')),
      () => h('div', null, h('b', null, 'a'), h('span', null, 'z')),
    )
    expect(r.hyd).toBe(r.cold)
    expect(r.hyd).toBe('<div><b>a</b><span>z</span></div>')
    r.dispose()
  })

  it('server rendered an EXTRA trailing element', async () => {
    const r = await parity(
      () => h('div', null, h('b', null, 'a'), h('i', null, 'extra')),
      () => h('div', null, h('b', null, 'a')),
    )
    expect(r.hyd).toBe(r.cold)
    expect(r.hyd).toBe('<div><b>a</b></div>')
    r.dispose()
  })

  it('server rendered an EXTRA trailing text node', async () => {
    const r = await parity(
      () => h('div', null, h('b', null, 'a'), 'extra'),
      () => h('div', null, h('b', null, 'a')),
    )
    expect(r.hyd).toBe(r.cold)
    expect(r.hyd).toBe('<div><b>a</b></div>')
    r.dispose()
  })

  // ─── Root boundary ─────────────────────────────────────────────────────────

  it('ROOT: an extra trailing sibling in the container', async () => {
    const r = await parity(
      () => [h('b', null, 'a'), h('i', null, 'extra')] as never,
      () => [h('b', null, 'a')] as never,
    )
    expect(r.hyd).toBe(r.cold)
    expect(r.hyd).toBe('<b>a</b>')
    r.dispose()
  })

  it('ROOT: a TAG mismatch on the root element itself', async () => {
    const r = await parity(
      () => h('span', null, 'x'),
      () => h('div', null, 'x'),
    )
    expect(r.hyd).toBe(r.cold)
    expect(r.hyd).toBe('<div>x</div>')
    r.dispose()
  })

  // ─── Identity: the sweep must not cost an adoption ────────────────────────

  it('a text mismatch hands the following element to the sibling that OWNS it', async () => {
    // The point of REPLACING the stale text (rather than leaving it at the
    // cursor for the boundary to sweep) is that the next sibling then meets
    // the server node it actually corresponds to. Parity alone cannot see
    // this — both arms render the same HTML either way — so assert identity.
    const html = await renderToString(h('div', null, 'stale', h('b', null, 'x')) as never)
    const c = host(html)
    const serverB = c.querySelector('b')
    const dispose = hydrateRoot(c, h('div', null, 'fresh', h('b', null, 'x')) as never)
    expect(c.querySelector('b'), 'the server <b> is ADOPTED, not rebuilt').toBe(serverB)
    dispose()
  })

  it('a MID-list text mismatch keeps sibling order AND adopts the element after it', async () => {
    const html = await renderToString(
      h('p', null, h('b', null, 'one'), 'SERVER', h('i', null, 'three')) as never,
    )
    const c = host(html)
    const serverI = c.querySelector('i')
    const dispose = hydrateRoot(
      c,
      h('p', null, h('b', null, 'one'), 'two', h('i', null, 'three')) as never,
    )
    expect(c.firstElementChild?.textContent).toBe('onetwothree')
    expect(c.querySelector('i')).toBe(serverI)
    dispose()
  })

  // ─── Controls: nothing may be swept when the two sides AGREE ──────────────

  it('CONTROL — server and client agree: nothing is removed, identity is retained', async () => {
    const html = await renderToString(
      h('div', null, 'same', h('b', null, 'x'), h('i', null, 'y')) as never,
    )
    const c = host(html)
    const before = [...c.querySelectorAll('*')]
    const dispose = hydrateRoot(
      c,
      h('div', null, 'same', h('b', null, 'x'), h('i', null, 'y')) as never,
    )
    expect(noC(c.innerHTML)).toBe('<div>same<b>x</b><i>y</i></div>')
    const after = new Set(c.querySelectorAll('*'))
    expect(before.every((n) => after.has(n)), 'every server element kept').toBe(true)
    expect(after.size).toBe(before.length)
    dispose()
  })

  it('CONTROL — the reactive-text mismatch #3466 already covered still holds', async () => {
    const r = await parity(
      () => h('div', null, () => 'stale'),
      () => h('div', null, () => 'fresh'),
    )
    expect(r.hyd).toBe(r.cold)
    expect(r.hyd).toBe('<div>fresh</div>')
    r.dispose()
  })

  it('CONTROL — an adopted dangerouslySetInnerHTML payload is NOT swept', async () => {
    // The hazard the old "known gap" comment named, and the reason the element
    // sweep is gated on the vnode HAVING children: with none, the residual
    // cursor is still the element's FIRST child and "nothing was claimed" is
    // indistinguishable from "a prop owns this content".
    const dsi = { __html: '<b>x</b><i>y</i>' }
    const r = await parity(
      () => h('div', { dangerouslySetInnerHTML: dsi }),
      () => h('div', { dangerouslySetInnerHTML: dsi }),
    )
    expect(r.hyd).toBe(r.cold)
    expect(r.hyd).toBe('<div><b>x</b><i>y</i></div>')
    r.dispose()
  })

  it('CONTROL — a sanitized innerHTML prop is NOT swept', async () => {
    const c = host('<div><b>server</b></div>')
    const dispose = hydrateRoot(c, h('div', { innerHTML: '<b>client</b>' }) as never)
    expect(noC(c.innerHTML)).toBe('<div><b>client</b></div>')
    dispose()
  })

  it('CONTROL — the sweep does not detach a live reactive boundary', async () => {
    // A trailing accessor installs `mountReactive`'s anchor at the end of the
    // child list. Sweeping past it would detach the boundary and the accessor
    // could never render again — so this asserts a FLIP after hydration, not
    // just the settled DOM.
    const s = signal('a')
    const html = await renderToString(h('div', null, h('b', null, 'k'), () => 'a') as never)
    const c = host(html)
    const dispose = hydrateRoot(c, h('div', null, h('b', null, 'k'), () => s()) as never)
    expect(noC(c.innerHTML)).toBe('<div><b>k</b>a</div>')
    s.set('z')
    expect(noC(c.innerHTML), 'the binding is still live').toBe('<div><b>k</b>z</div>')
    dispose()
  })

  it('DEGRADE, DON\'T DESTROY — a component that THROWS in setup leaves the server markup', () => {
    // `hydrateComponent` catches a setup throw per component so one broken
    // component cannot take the page down: it logs and returns an unadvanced
    // cursor, leaving the server's markup visible but un-interactive. A sweep
    // that ran there would turn that degraded page into a BLANK one — and
    // parity does not argue for it, because a cold mount of the same throwing
    // component renders nothing either, so "correct" here is empty and
    // strictly less useful.
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const Boom = () => {
        throw new Error('boom')
      }
      const c = host('<section><b>server</b></section>')
      const dispose = hydrateRoot(c, h(Boom as never, null))
      expect(noC(c.innerHTML), 'the server page is still on screen').toBe(
        '<section><b>server</b></section>',
      )
      dispose()
    } finally {
      err.mockRestore()
    }
  })

  it('DEGRADE, DON\'T DESTROY — the same holds one level in, at an element boundary', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const Boom = () => {
        throw new Error('boom')
      }
      const c = host('<div><b>server</b></div>')
      const dispose = hydrateRoot(c, h('div', null, h(Boom as never, null)) as never)
      expect(noC(c.innerHTML)).toBe('<div><b>server</b></div>')
      dispose()
    } finally {
      err.mockRestore()
    }
  })

  it('CONTROL — a trailing accessor whose server range is STALE sweeps only the stale nodes', async () => {
    const s = signal(false)
    const html = await renderToString(
      h('div', null, h('b', null, 'k'), () => h('i', null, 'server')) as never,
    )
    const c = host(html)
    const dispose = hydrateRoot(
      c,
      h('div', null, h('b', null, 'k'), () => (s() ? h('i', null, 'client') : null)) as never,
    )
    expect(noC(c.innerHTML)).toBe('<div><b>k</b></div>')
    s.set(true)
    expect(noC(c.innerHTML)).toBe('<div><b>k</b><i>client</i></div>')
    dispose()
  })
})

// ─── Compiled path ───────────────────────────────────────────────────────────

/**
 * The compiled path reaches the element boundary through a DIFFERENT door: a
 * `_tpl` NativeItem sitting in an h() children array, whose siblings the walk
 * still cursors over. A whole-element divergence is handled earlier (the `_tpl`
 * adopt verifier refuses a skeleton that does not match and clones), so these
 * two cells pin the halves that actually differ: an extra server sibling BESIDE
 * a compiled region, and the verifier's own clone path still landing on parity.
 */
const RUNTIME_DEPS = {
  _tpl,
  _bind,
  _bindText,
  _bindProp,
  _bindDirect,
  _bindSpread,
  _applyProps,
  _setStyle,
  _setAttr,
  _setClass,
  _setValue,
  _setHtml,
  _mountSlot,
  _textSlot,
  _setChild,
  _setChildAt,
  _mountChild,
  _fuse,
  _lc,
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

/** Every imported runtime helper must be provided, or the compiled body hits a
 *  free variable and the spec silently asserts the SERVER DOM instead. */
function assertDepsCover(code: string): void {
  for (const m of code.matchAll(/^import\s*\{([^}]*)\}\s*from\s*["'][^"']+["']/gm)) {
    for (const raw of (m[1] ?? '').split(',')) {
      const name = raw.trim().split(/\s+as\s+/).pop()?.trim()
      if (name && !DEP_NAMES.includes(name)) {
        throw new Error(`[harness] the emit imports "${name}" but RUNTIME_DEPS does not provide it`)
      }
    }
  }
}

function compileApp(source: string): () => unknown {
  const { code } = transformJSX(source, 'test.tsx')
  assertDepsCover(code)
  const body = lowerResidualJsx(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''))
  return new Function(...DEP_NAMES, `${body}\nreturn App`)(...DEP_VALUES) as () => unknown
}

describe('hydration boundary sweep — compiled through the REAL transform', () => {
  beforeAll(() => disableHydrationWarnings())
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('an extra server sibling beside a compiled region is swept', async () => {
    const App = compileApp('function App() { return <b class="k">a</b> }')
    const html = await renderToString(
      h('div', null, h('b', { class: 'k' }, 'a'), h('i', null, 'extra')) as never,
    )
    const c = host(html)
    const serverB = c.querySelector('b')
    const dispose = hydrateRoot(c, h('div', null, h(App as never, null)) as never)
    expect(noC(c.innerHTML)).toBe('<div><b class="k">a</b></div>')
    expect(c.querySelector('b'), 'the compiled region still ADOPTED its node').toBe(serverB)
    dispose()
  })

  it('a compiled region whose skeleton does NOT match still lands on parity', async () => {
    // The `_tpl` verifier refuses the server node and clones; the swap replaces
    // it, and the boundary sweep takes whatever the swap left over.
    const App = compileApp('function App() { return <b class="k">a</b> }')
    const html = await renderToString(
      h('div', null, h('i', { class: 'k' }, 'a'), h('u', null, 'extra')) as never,
    )
    const c = host(html)
    const dispose = hydrateRoot(c, h('div', null, h(App as never, null)) as never)
    const cold = host()
    const unmount = mount(h('div', null, h(App as never, null)) as never, cold)
    expect(noC(c.innerHTML), 'hydrated equals a cold mount').toBe(noC(cold.innerHTML))
    expect(noC(c.innerHTML)).toBe('<div><b class="k">a</b></div>')
    dispose()
    unmount()
  })
})
