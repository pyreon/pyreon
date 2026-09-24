/**
 * Path URLs — `/atlas/button/` rather than `/atlas/?c=button`.
 *
 * The whole branch is opt-in on a global the HOST sets (`atlas build` and
 * `atlas dev` set it; a workbench embedded in someone else's app does not,
 * because writing `/button/` there would 404 on reload). `model.test.ts` covers
 * the query-string half; this file covers the routed half and — as the pairing
 * that makes it meaningful — that the SAME catalog keeps the query behaviour
 * when the global is absent.
 *
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { WorkbenchCatalog, WorkbenchComponent } from '../catalog'
import { createModel } from '../model'

interface RouteHost {
  __ATLAS_ROUTES__?: boolean
}

const comp = (id: string): WorkbenchComponent => ({
  id,
  name: id,
  group: 'G',
  controls: [{ key: 'label', label: 'Label', type: 'text', default: id }],
  render: (props) => `${id}:${String(props.label ?? '')}`,
})

const CATALOG: WorkbenchCatalog = { components: [comp('button'), comp('badge')] }

const at = (url: string) => history.replaceState(null, '', url)

beforeEach(() => {
  at('/')
  delete (globalThis as RouteHost).__ATLAS_ROUTES__
})

afterEach(() => {
  delete (globalThis as RouteHost).__ATLAS_ROUTES__
  at('/')
})

const routed = () => {
  ;(globalThis as RouteHost).__ATLAS_ROUTES__ = true
}

describe('reading a path URL', () => {
  it('selects the component named by the last path segment', () => {
    routed()
    at('/atlas/badge/')
    expect(createModel(CATALOG, {}).selId()).toBe('badge')
  })

  it('does NOT read the path when the host has not opted in', () => {
    // The identical URL, without the global: an embedded workbench keeps the
    // query-string behaviour, so it falls back to the first component.
    at('/atlas/badge/')
    expect(createModel(CATALOG, {}).selId()).toBe('button')
  })

  it('the PATH wins over a stale `?c=` naming a different component', () => {
    routed()
    at('/atlas/badge/?c=button')
    expect(createModel(CATALOG, {}).selId()).toBe('badge')
  })

  it('ignores a path segment that names no component, falling back to the first', () => {
    routed()
    at('/atlas/nope/')
    expect(createModel(CATALOG, {}).selId()).toBe('button')
  })

  it('still honours `?c=` when the path names nothing', () => {
    routed()
    at('/atlas/?c=badge')
    expect(createModel(CATALOG, {}).selId()).toBe('badge')
  })
})

describe('writing a path URL', () => {
  it('writes an ABSOLUTE path when the selection changes', () => {
    routed()
    at('/atlas/button/')
    const m = createModel(CATALOG, {})
    m.selId.set('badge')
    // Absolute, not a bare `?query`: a relative form resolves against the
    // current directory and would leave the stale `button` segment in place,
    // producing a URL whose path and query name different components.
    expect(location.pathname).toBe('/atlas/badge/')
  })

  it('carries the component in the PATH ONLY — never in the query as well', () => {
    routed()
    at('/atlas/button/')
    const m = createModel(CATALOG, {})
    m.selId.set('badge')
    expect(new URLSearchParams(location.search).get('c')).toBeNull()
  })

  it('keeps the REST of the state in the query beside the path', () => {
    routed()
    at('/atlas/button/')
    const m = createModel(CATALOG, {})
    m.dark.set(false)
    expect(location.pathname).toBe('/atlas/button/')
    expect(new URLSearchParams(location.search).get('dark')).toBe('0')
  })

  it('round-trips: the URL it writes reads back as the same component and args', () => {
    routed()
    at('/atlas/button/')
    const m = createModel(CATALOG, {})
    m.selId.set('badge')
    m.setValue('badge', 'label', 'Edited')

    const restored = createModel(CATALOG, {})
    expect(restored.selId()).toBe('badge')
    expect(restored.vals()).toEqual({ label: 'Edited' })
  })

  it('writes a query URL, not a path, when the host has NOT opted in', () => {
    at('/atlas/')
    const m = createModel(CATALOG, {})
    m.selId.set('badge')
    expect(location.pathname).toBe('/atlas/')
    expect(new URLSearchParams(location.search).get('c')).toBe('badge')
  })

  it('degrades to the base rather than emitting `//` for an empty catalog', () => {
    routed()
    at('/atlas/')
    const m = createModel({ components: [] }, {})
    m.dark.set(false)
    expect(m.selId()).toBe('')
    expect(location.pathname).toBe('/atlas/')
  })
})
