/**
 * The sidebar tree's layout contracts — owners, reveal-on-select, the
 * opening selection, the scenario marker and the filter count.
 *
 * Each block is a behaviour the workbench UI used to get wrong in a way a
 * browser screenshot showed and nothing asserted:
 *  - `Accordion` appeared twice (a leaf AND a folder header), unrelated;
 *  - `/accordion-item` opened with its row three screens down, unhighlighted;
 *  - the default was `catalog.components[0]`, which is not the first row;
 *  - twelve equally-green scenario dots, none marked as the one on screen;
 *  - a filter matching nothing still reported `108`.
 *
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { WorkbenchCatalog, WorkbenchComponent } from '../catalog'
import {
  ancestorPaths,
  browseOrder,
  buildHierarchy,
  countUnder,
  mergeOwners,
  nodeEntries,
  ownerPaths,
  partCount,
} from '../hierarchy'
import { createModel } from '../model'

beforeEach(() => {
  if (typeof history !== 'undefined') history.replaceState(null, '', '/')
  try {
    localStorage.clear()
  } catch {
    // no storage — the model renders the same without it
  }
})

const c = (id: string, name: string, group: string, over: Partial<WorkbenchComponent> = {}): WorkbenchComponent => ({
  id,
  name,
  group,
  controls: [],
  render: () => null,
  ...over,
})

// The shape a directory-derived catalog produces: nested folders are listed
// FIRST, and a component sits beside the folder holding its parts.
const COMPONENTS = [
  c('combobox', 'Combobox', 'Components/Combobox'),
  c('combobox-styled', 'ComboboxStyled', 'Components/Combobox'),
  c('password-input', 'PasswordInput', 'Components/PasswordInput'),
  c('accordion-item', 'AccordionItem', 'Components/Accordion', { partOf: 'accordion' }),
  c('accordion-trigger', 'AccordionTrigger', 'Components/Accordion', { partOf: 'accordion' }),
  c('box', 'Box', 'Components'),
  c('accordion', 'Accordion', 'Components', {
    scenarios: [
      { id: 'accordion--default', name: 'Default', args: {}, verdict: 'ok' },
      { id: 'accordion--open', name: 'open=true', args: { open: true }, verdict: 'ok' },
    ],
  }),
  c('divider', 'Divider', 'Components'),
]
const CATALOG: WorkbenchCatalog = { components: COMPONENTS }

describe('mergeOwners — a folder named after a component IS that component', () => {
  const tree = mergeOwners(buildHierarchy(COMPONENTS))
  const root = tree[0]!

  it('attaches the sibling component as the folder owner, keeping its curated slot', () => {
    const accordion = root.children.find((n) => n.name === 'Accordion')!
    expect(accordion.owner?.id).toBe('accordion')
    expect(accordion.ownerFromParent).toBe(true)
    // Rendered IN PLACE of the `Accordion` item — between Box and Divider,
    // where the catalog put it — not appended after every item.
    const order = nodeEntries(root).map((e) => (e.kind === 'item' ? e.component.id : `[${e.node.name}]`))
    expect(order).toEqual(['box', '[Accordion]', 'divider', '[Combobox]', '[PasswordInput]'])
  })

  it('takes an own-item owner (Combobox/Combobox) out of the folder items', () => {
    const combobox = root.children.find((n) => n.name === 'Combobox')!
    expect(combobox.owner?.id).toBe('combobox')
    expect(combobox.items.map((i) => i.id)).toEqual(['combobox-styled'])
  })

  it('still lists every component exactly once, and counts agree', () => {
    const order = browseOrder(tree, new Set())
    expect([...order].sort()).toEqual(COMPONENTS.map((x) => x.id).sort())
    expect(countUnder(root)).toBe(COMPONENTS.length)
  })

  it('treats a folder holding only its own component as a plain row, not a list', () => {
    const pw = root.children.find((n) => n.name === 'PasswordInput')!
    expect(partCount(pw)).toBe(0)
    expect(ownerPaths(tree).sort()).toEqual(['Components/Accordion', 'Components/Combobox'])
  })

  it('keeps an owner row visible when its part list is collapsed', () => {
    const order = browseOrder(tree, new Set(['Components/Accordion']))
    expect(order).toContain('accordion')
    expect(order).not.toContain('accordion-item')
  })

  it('names the folders a component needs OPEN — not the one it owns', () => {
    expect(ancestorPaths(tree, 'accordion-item')).toEqual(['Components', 'Components/Accordion'])
    expect(ancestorPaths(tree, 'accordion')).toEqual(['Components'])
    expect(ancestorPaths(tree, 'combobox')).toEqual(['Components'])
    expect(ancestorPaths(tree, 'nope')).toEqual([])
  })

  it('lets a ROOT folder own its namesake too (Button/Button.tsx at the top level)', () => {
    const roots = mergeOwners(
      buildHierarchy([c('button', 'Button', 'Button'), c('button-group', 'ButtonGroup', 'Button')]),
    )
    expect(roots[0]!.owner?.id).toBe('button')
    expect(roots[0]!.items.map((i) => i.id)).toEqual(['button-group'])
  })
})

describe('createModel — the opening selection is the first row the sidebar shows', () => {
  it('opens on the first SHOWN row, not catalog.components[0]', () => {
    // catalog order starts with `combobox` (a nested folder); the sidebar
    // starts with `box`.
    expect(createModel(CATALOG, {}).selId()).toBe('box')
  })

  it('starts part lists collapsed and plain folders expanded', () => {
    const m = createModel(CATALOG, {})
    expect(m.isCollapsed('Components/Accordion')).toBe(true)
    expect(m.isCollapsed('Components')).toBe(false)
  })
})

describe('createModel — reveal on select', () => {
  it('expands every folder above a newly selected row', () => {
    const m = createModel(CATALOG, {})
    expect(m.browseIds()).not.toContain('accordion-item')
    m.selId.set('accordion-item')
    expect(m.isCollapsed('Components/Accordion')).toBe(false)
    expect(m.browseIds()).toContain('accordion-item')
  })

  it('reveals the component a LINK names at load', () => {
    history.replaceState(null, '', '/?c=accordion-trigger')
    const m = createModel(CATALOG, {})
    expect(m.selId()).toBe('accordion-trigger')
    expect(m.isCollapsed('Components/Accordion')).toBe(false)
  })

  it('does not re-open a folder the user collapsed around the selection', () => {
    const m = createModel(CATALOG, {})
    m.selId.set('accordion-item')
    m.toggleGroup('Components/Accordion')
    expect(m.isCollapsed('Components/Accordion')).toBe(true)
  })

  it('opens every folder while filtering, so a match is never hidden', () => {
    const m = createModel(CATALOG, {})
    m.filter.set('trigger')
    expect(m.isCollapsed('Components/Accordion')).toBe(false)
    expect(m.browseIds()).toContain('accordion-trigger')
    m.filter.set('')
    expect(m.isCollapsed('Components/Accordion')).toBe(true)
  })
})

describe('createModel — filter count', () => {
  it('reports the matched count, and 0 with noResults for a miss', () => {
    const m = createModel(CATALOG, {})
    expect(m.matchCount()).toBe(COMPONENTS.length)
    m.filter.set('accordion')
    expect(m.matchCount()).toBe(3)
    m.filter.set('zzzz')
    expect(m.matchCount()).toBe(0)
    expect(m.noResults()).toBe(true)
  })
})

describe('createModel — the active scenario', () => {
  it('is Default when the component has no edits', () => {
    const m = createModel(CATALOG, {})
    m.selId.set('accordion')
    expect(m.activeScenario()).toBe('accordion--default')
  })

  it('follows an applied scenario, and clears on any edit', () => {
    const m = createModel(CATALOG, {})
    m.selectScenario('accordion', 'accordion--open')
    expect(m.activeScenario()).toBe('accordion--open')
    m.setValue('accordion', 'open', false)
    expect(m.activeScenario()).toBe(null)
    m.reset()
    expect(m.activeScenario()).toBe('accordion--default')
  })
})
