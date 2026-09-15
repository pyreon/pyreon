// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { WorkbenchCatalog, WorkbenchComponent } from '../catalog'
import { createModel } from '../model'
import { parseUrlState, serializeUrlState } from '../url-state'

const comp = (id: string, group: string, over: Partial<WorkbenchComponent> = {}): WorkbenchComponent => ({
  id,
  name: id.charAt(0).toUpperCase() + id.slice(1),
  group,
  controls: [],
  render: () => id,
  ...over,
})

const CATALOG: WorkbenchCatalog = {
  components: [
    comp('button', 'Actions'),
    comp('tabs', 'Navigation'),
    comp('tab-panel', 'Navigation', { partOf: 'tabs' }),
    comp('input', 'Forms'),
  ],
}

beforeEach(() => {
  try {
    localStorage.clear()
  } catch {
    // no storage in this environment — the model must not care
  }
  history.replaceState(null, '', '/')
})
afterEach(() => history.replaceState(null, '', '/'))

describe('the sidebar filter', () => {
  it('is its own signal — the ⌘K query never narrows the tree', () => {
    const m = createModel(CATALOG, {})
    m.query.set('tabs')
    expect(m.tree().length).toBe(3)
    m.filter.set('tabs')
    expect(m.tree().map((n) => n.name)).toEqual(['Navigation'])
    expect(m.noResults()).toBe(false)
    m.filter.set('zzz')
    expect(m.noResults()).toBe(true)
  })
})

describe('browseIds', () => {
  it('follows the rendered tree: filter applied, parts after parents, collapsed groups skipped', () => {
    const m = createModel(CATALOG, {})
    expect(m.browseIds()).toEqual(['button', 'tabs', 'tab-panel', 'input'])
    m.toggleGroup('Navigation')
    expect(m.browseIds()).toEqual(['button', 'input'])
    m.toggleGroup('Navigation')
    m.filter.set('tab')
    expect(m.browseIds()).toEqual(['tabs', 'tab-panel'])
  })
})

describe('chrome preferences survive a reload', () => {
  it('writes brand, appearance, widths and open flags, and reads them back', () => {
    const m = createModel(CATALOG, {})
    m.brandId.set('slate')
    m.dark.set(false)
    m.sidebarW.set(300)
    m.panelOpen.set(false)
    const again = createModel(CATALOG, {})
    expect(again.brandId()).toBe('slate')
    expect(again.dark()).toBe(false)
    expect(again.sidebarW()).toBe(300)
    expect(again.panelOpen()).toBe(false)
  })

  it('lets a link win over the stored preference for what it names', () => {
    const m = createModel(CATALOG, {})
    m.dark.set(false)
    history.replaceState(null, '', '/?dark=1')
    // `dark=1` parses as true and beats the stored false.
    const again = createModel(CATALOG, {})
    expect(again.dark()).toBe(true)
    void m
  })
})

describe('the link carries the view and the addon states that change what renders', () => {
  it('round-trips view, pseudo, query state and role', () => {
    const q = serializeUrlState({ view: 'docs', pseudo: 'hover', query: 'loading', role: 'editor' })
    expect(parseUrlState(q)).toEqual({ view: 'docs', pseudo: 'hover', query: 'loading', role: 'editor' })
    // The defaults stay out of the link.
    expect(serializeUrlState({ view: 'canvas', query: 'success' })).toBe('')
  })

  it('opens on the view and states the link names', () => {
    history.replaceState(null, '', '/?view=docs&pseudo=focus&query=loading')
    const m = createModel(CATALOG, {})
    expect(m.view()).toBe('docs')
    expect(m.pseudo()).toBe('focus')
    expect(m.queryState()).toBe('loading')
  })

  it('ignores a value it cannot show rather than selecting a state the pickers lack', () => {
    history.replaceState(null, '', '/?view=nope&pseudo=nope&query=nope&role=nope')
    const m = createModel(CATALOG, {})
    expect(m.view()).toBe('canvas')
    expect(m.pseudo()).toBeNull()
    expect(m.queryState()).toBe('success')
    expect(m.permissionSet()).toBe('anonymous')
  })
})
