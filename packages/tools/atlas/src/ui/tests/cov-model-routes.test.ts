/**
 * Path URLs — `/atlas/button/` rather than `/atlas/?c=button` — when a HOST
 * ROUTER owns them (`WorkbenchRoute`).
 *
 * `atlas dev` and `atlas build` run the workbench as a zero app whose router
 * matches `/`, `/:component` and a catch-all; its shell hands the workbench a
 * route. The workbench reads the selection from it and writes through it, and
 * never parses or builds a path itself — the path guessing it used to do
 * (`pathBase` from `location.pathname`) wrote `/sub/old-name/button/` for a
 * stale link, a URL no page answers.
 *
 * The route here is a stand-in with the router's contract: `id()` is reactive,
 * `go()` navigates (and so moves `id()`). The real router wiring is covered in
 * real Chromium by the atlas-build and atlas-dev e2e.
 *
 * @vitest-environment happy-dom
 */
import { signal } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { WorkbenchCatalog, WorkbenchComponent } from '../catalog'
import { createModel, type WorkbenchRoute } from '../model'

const comp = (id: string): WorkbenchComponent => ({
  id,
  name: id,
  group: 'G',
  controls: [{ key: 'label', label: 'Label', type: 'text', default: id }],
  render: (props) => `${id}:${String(props.label ?? '')}`,
})

const CATALOG: WorkbenchCatalog = { components: [comp('button'), comp('badge')] }

const at = (url: string) => history.replaceState(null, '', url)

/** A router stand-in: `go` navigates, which is what moves `id`. */
function fakeRoute(initialId: string | undefined, query = '') {
  const id = signal(initialId)
  const writes: { id: string; query: string }[] = []
  at(`/${initialId ? `${initialId}/` : ''}${query ? `?${query}` : ''}`)
  const route: WorkbenchRoute = {
    id: () => id(),
    go: (next, q) => {
      writes.push({ id: next, query: q })
      id.set(next)
    },
  }
  return { route, writes, navigate: (next: string | undefined) => id.set(next) }
}

beforeEach(() => at('/'))
afterEach(() => at('/'))

describe('reading the route', () => {
  it('selects the component the route names', () => {
    const { route } = fakeRoute('badge')
    expect(createModel(CATALOG, { route }).selId()).toBe('badge')
  })

  it('the ROUTE wins over a stale `?c=` naming a different component', () => {
    const { route } = fakeRoute('badge', 'c=button')
    expect(createModel(CATALOG, { route }).selId()).toBe('badge')
  })

  it('still honours `?c=` when the route names nothing (the root)', () => {
    const { route } = fakeRoute(undefined, 'c=badge')
    expect(createModel(CATALOG, { route }).selId()).toBe('badge')
  })

  it('without a route the path is never read — an embedded workbench uses `?c=`', () => {
    at('/atlas/badge/')
    expect(createModel(CATALOG, {}).selId()).toBe('button')
  })

  it('a navigation the ROUTER makes (back / forward) moves the selection', () => {
    const { route, navigate } = fakeRoute('button')
    const m = createModel(CATALOG, { route })
    navigate('badge')
    expect(m.selId()).toBe('badge')
  })
})

describe('a route that names no component', () => {
  it('a STALE id (a renamed component) selects the default and navigates the router to it', () => {
    // The regression: the workbench guessed the base from the path and wrote
    // `/old-name/button/`, which no page answers — a blank page on reload.
    const { route, writes } = fakeRoute('old-name', 'c=badge')
    const m = createModel(CATALOG, { route })
    expect(m.selId()).toBe('button')
    expect(writes.at(-1)?.id).toBe('button')
  })

  it('a stale id does not take a stale `?c=` either', () => {
    const { route } = fakeRoute('old-name', 'c=badge')
    expect(createModel(CATALOG, { route }).selId()).toBe('button')
  })

  it('a navigation to an unknown id leaves the selection alone', () => {
    const { route, navigate } = fakeRoute('badge')
    const m = createModel(CATALOG, { route })
    navigate('nope')
    expect(m.selId()).toBe('badge')
  })
})

describe('writing through the route', () => {
  it('writes the selection through the ROUTER, never history directly', () => {
    const { route, writes } = fakeRoute('button')
    const m = createModel(CATALOG, { route })
    const before = location.href
    m.selId.set('badge')
    expect(writes.at(-1)).toEqual({ id: 'badge', query: '' })
    // The stand-in does not touch history, so neither may the workbench.
    expect(location.href).toBe(before)
  })

  it('carries the component in the ROUTE ONLY — never in the query as well', () => {
    const { route, writes } = fakeRoute('button')
    const m = createModel(CATALOG, { route })
    m.setValue('button', 'label', 'Edited')
    const last = writes.at(-1)!
    expect(last.id).toBe('button')
    expect(new URLSearchParams(last.query).get('c')).toBeNull()
    expect(new URLSearchParams(last.query).get('args')).toContain('Edited')
  })

  it('writes a query URL, not a route, when there is no router', () => {
    at('/atlas/')
    const m = createModel(CATALOG, {})
    m.selId.set('badge')
    expect(location.pathname).toBe('/atlas/')
    expect(new URLSearchParams(location.search).get('c')).toBe('badge')
  })

  it('an empty catalog navigates to the root, never to `//`', () => {
    const { route, writes } = fakeRoute(undefined)
    const m = createModel({ components: [] }, { route })
    m.dark.set(!m.dark())
    expect(m.selId()).toBe('')
    expect(writes.every((w) => w.id === '')).toBe(true)
  })
})
