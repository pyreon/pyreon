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

const read = (m: ReturnType<typeof createModel>) => ({
  brand: m.brandId(),
  sidebarW: m.sidebarW(),
  panelFrac: m.panelFrac(),
})
const defaults = () => {
  localStorage.clear()
  return read(createModel(CATALOG, {}))
}

describe('stored preferences', () => {
  it('applies every well-typed field', () => {
    localStorage.setItem(KEY, JSON.stringify({ brand: 'forest', sidebarW: 300, panelFrac: 0.4 }))
    expect(read(createModel(CATALOG, {}))).toEqual({ brand: 'forest', sidebarW: 300, panelFrac: 0.4 })
  })

  it('ignores each wrongly-typed field and keeps its default', () => {
    const base = defaults()
    localStorage.setItem(KEY, JSON.stringify({ brand: 7, sidebarW: 'wide', panelFrac: 'half' }))
    expect(read(createModel(CATALOG, {}))).toEqual(base)
  })

  it('ignores a panel split outside 20–80% — a corrupt value cannot hide the canvas or the panels', () => {
    const base = defaults()
    for (const panelFrac of [0, 0.05, 0.95, 1, -1]) {
      localStorage.setItem(KEY, JSON.stringify({ panelFrac }))
      expect(createModel(CATALOG, {}).panelFrac(), String(panelFrac)).toBe(base.panelFrac)
    }
  })

  it.each([
    ['an array', '[1,2]'],
    ['a bare value', '42'],
    ['null', 'null'],
    ['broken JSON', '{"sidebarW": '],
  ])('ignores %s as a whole', (_label, raw) => {
    const base = defaults()
    localStorage.setItem(KEY, raw)
    expect(read(createModel(CATALOG, {}))).toEqual(base)
  })
})
