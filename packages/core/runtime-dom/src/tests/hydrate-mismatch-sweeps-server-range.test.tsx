/**
 * A hydration MISMATCH inside a reactive accessor range must sweep the server
 * DOM the client did not claim IMMEDIATELY — not on the accessor's next run.
 *
 * `adoptReactiveRange` hands the accessor's first render to `hydrateChild`,
 * which recovers a divergence (server `<ul>`, client `<p>`) by mounting the
 * client's render fresh before the anchor and returning the cursor it stopped
 * at. Before this fix the server nodes it did not consume stayed in the DOM
 * until the accessor re-ran: a list whose SERVER query cache was warm and
 * whose CLIENT cache was cold rendered its rows on the server, its loading
 * placeholder on the client, and kept BOTH on screen for the whole fetch —
 * three countable rows with delete buttons carrying no handler. The
 * fundamentals-playground `useDelete` e2e clicked one of those dead buttons
 * after the hydration barrier and failed 3/5 locally, more under CI load.
 *
 * The parity fuzz cannot see this: its oracle is ZERO mismatches, and the bug
 * lives only on the mismatch-recovery path.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { disableHydrationWarnings, hydrateRoot } from '../index'

const strip = (s: string) => s.replace(/<!--[\s\S]*?-->/g, '')

function mountHost(html: string): HTMLElement {
  const c = document.createElement('div')
  document.body.appendChild(c)
  c.innerHTML = html
  return c
}

/** The demo's shape: a query-backed list whose server cache is warm and whose client cache is cold. */
function tree(loading: () => boolean, rows: () => string[]) {
  return () =>
    h('main', null, () =>
      loading()
        ? h('p', { class: 'loading' }, 'Loading…')
        : h('ul', null, ...rows().map((r) => h('li', { 'data-row': r }, h('button', { 'data-del': r }, 'x')))),
    )
}

describe('hydration — a mismatch sweeps the unclaimed server range now', () => {
  beforeAll(() => disableHydrationWarnings())
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('SOLE accessor child (marker-elided path): server rows are gone as soon as hydrateRoot returns', async () => {
    const serverLoading = signal(false)
    const html = await renderToString(tree(serverLoading, () => ['1', '2', '3'])() as never)
    const c = mountHost(html)
    expect(c.querySelectorAll('li').length).toBe(3)

    const clientLoading = signal(true)
    const cleanup = hydrateRoot(c, tree(clientLoading, () => ['1', '2'])() as never)

    // The client's first render is the placeholder; nothing else may remain.
    expect(c.querySelector('p.loading')).not.toBeNull()
    expect(c.querySelectorAll('li').length).toBe(0)
    expect(c.querySelectorAll('[data-del]').length).toBe(0)
    expect(strip(c.innerHTML)).toBe('<main><p class="loading">Loading…</p></main>')

    // LIVENESS: the fetch lands, the rows render, and a later flip clears them.
    clientLoading.set(false)
    expect(c.querySelectorAll('li').length).toBe(2)
    expect(c.querySelector('p.loading')).toBeNull()
    clientLoading.set(true)
    expect(strip(c.innerHTML)).toBe('<main><p class="loading">Loading…</p></main>')
    cleanup()
  })

  it('MARKED accessor child (`<!--$-->` path): the same sweep, with a static sibling in the way', async () => {
    const serverLoading = signal(false)
    const marked = (loading: () => boolean, rows: () => string[]) => () =>
      h('main', null, h('h1', null, 'Tasks'), () =>
        loading()
          ? h('p', { class: 'loading' }, 'Loading…')
          : h('ul', null, ...rows().map((r) => h('li', { 'data-row': r }, r))),
      )
    const html = await renderToString(marked(serverLoading, () => ['1', '2', '3'])() as never)
    expect(html).toContain('<!--$-->')
    const c = mountHost(html)

    const clientLoading = signal(true)
    const cleanup = hydrateRoot(c, marked(clientLoading, () => ['1'])() as never)
    expect(c.querySelectorAll('li').length).toBe(0)
    expect(strip(c.innerHTML)).toBe('<main><h1>Tasks</h1><p class="loading">Loading…</p></main>')

    clientLoading.set(false)
    expect(strip(c.innerHTML)).toBe('<main><h1>Tasks</h1><ul><li data-row="1">1</li></ul></main>')
    cleanup()
  })

  it('a MATCHING first render still ADOPTS (identity kept) — the sweep never touches claimed nodes', async () => {
    const loading = signal(false)
    const t = tree(loading, () => ['1', '2'])
    const html = await renderToString(t() as never)
    const c = mountHost(html)
    const serverUl = c.querySelector('ul')
    const cleanup = hydrateRoot(c, t() as never)
    expect(c.querySelector('ul')).toBe(serverUl)
    expect(c.querySelectorAll('li').length).toBe(2)
    cleanup()
  })
})
