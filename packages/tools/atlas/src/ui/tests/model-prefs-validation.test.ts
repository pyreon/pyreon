// @vitest-environment happy-dom
/**
 * Stored chrome preferences are read back from `localStorage`, which the user
 * (or an older atlas) can leave in any shape. A value of the wrong type must be
 * IGNORED field by field — never applied, never throwing — so one corrupt key
 * cannot cost the rest, and a corrupt blob cannot stop the workbench booting.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { WorkbenchCatalog } from '../catalog'
import { createModel } from '../model'

const CATALOG: WorkbenchCatalog = {
  components: [{ id: 'button', name: 'Button', group: 'Actions', controls: [], render: () => 'button' }],
}
const KEY = 'atlas:prefs'

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
})

const defaults = () => {
  localStorage.clear()
  const m = createModel(CATALOG, {})
  return { dark: m.dark(), sidebarW: m.sidebarW(), panelW: m.panelW(), sidebarOpen: m.sidebarOpen(), panelOpen: m.panelOpen() }
}

describe('stored preferences', () => {
  it('applies every well-typed field', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ dark: false, sidebarW: 300, panelW: 400, sidebarOpen: false, panelOpen: false }),
    )
    const m = createModel(CATALOG, {})
    expect([m.dark(), m.sidebarW(), m.panelW(), m.sidebarOpen(), m.panelOpen()]).toEqual([false, 300, 400, false, false])
  })

  it('ignores each wrongly-typed field and keeps its default', () => {
    const base = defaults()
    localStorage.setItem(
      KEY,
      JSON.stringify({ brand: 7, dark: 'no', sidebarW: 'wide', panelW: null, sidebarOpen: 1, panelOpen: 'yes' }),
    )
    const m = createModel(CATALOG, {})
    expect({ dark: m.dark(), sidebarW: m.sidebarW(), panelW: m.panelW(), sidebarOpen: m.sidebarOpen(), panelOpen: m.panelOpen() }).toEqual(base)
  })

  it.each([
    ['an array', '[1,2]'],
    ['a bare value', '42'],
    ['null', 'null'],
    ['broken JSON', '{"dark": '],
  ])('ignores %s as a whole', (_label, raw) => {
    const base = defaults()
    localStorage.setItem(KEY, raw)
    const m = createModel(CATALOG, {})
    expect(m.dark()).toBe(base.dark)
    expect(m.sidebarW()).toBe(base.sidebarW)
  })
})
