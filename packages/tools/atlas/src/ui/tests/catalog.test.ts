/**
 * Unit tests for the catalog helpers — the pure, DOM-free half of the workbench.
 *
 * These are deliberately NOT covered by the atlas-workshop e2e alone: the e2e
 * proves the assembled UI works in a browser, but it cannot pin the grouping /
 * defaulting / search CONTRACT that a generated catalog (the `atlas dev` CLI) has
 * to satisfy. A wrong `groupComponents` order or a `defaultValues` that drops a
 * falsy default is invisible on screen until someone's catalog trips it.
 */
import { describe, expect, it } from 'vitest'
import type { WorkbenchCatalog, WorkbenchComponent } from '../catalog'
import { buildSearch, componentById, defaultValues, groupComponents } from '../catalog'

const comp = (
  id: string,
  group: string,
  controls: WorkbenchComponent['controls'] = [],
  name = id,
): WorkbenchComponent => ({ id, name, group, controls, render: () => null })

const catalogOf = (...components: WorkbenchComponent[]): WorkbenchCatalog => ({ components })

describe('groupComponents', () => {
  it('groups by `group` and numbers groups in FIRST-SEEN order', () => {
    const cat = catalogOf(
      comp('button', 'Inputs'),
      comp('card', 'Surfaces'),
      comp('input', 'Inputs'),
    )
    const groups = groupComponents(cat)

    expect(groups.map((g) => g.group)).toEqual(['Inputs', 'Surfaces'])
    // `02` not `2` — the sidebar renders the number verbatim.
    expect(groups.map((g) => g.num)).toEqual(['01', '02'])
    // Interleaved members still land in their own group, order preserved.
    expect(groups[0]!.items.map((i) => i.id)).toEqual(['button', 'input'])
    expect(groups[1]!.items.map((i) => i.id)).toEqual(['card'])
  })

  it('returns [] for an empty catalog rather than a phantom group', () => {
    expect(groupComponents(catalogOf())).toEqual([])
  })
})

describe('defaultValues', () => {
  it('reads every control default, INCLUDING falsy ones', () => {
    // The regression that matters: `{ ...defaults, ...overrides }` in the model
    // means a dropped `false`/`''`/`0` default silently becomes `undefined`, and
    // a bool control would render unchecked-but-uncontrolled.
    const c = comp('x', 'g', [
      { key: 'on', label: 'On', type: 'bool', default: false },
      { key: 'label', label: 'Label', type: 'text', default: '' },
      { key: 'count', label: 'Count', type: 'text', default: 0 },
      { key: 'state', label: 'State', type: 'enum', options: ['a', 'b'], default: 'a' },
    ])

    expect(defaultValues(c)).toEqual({ on: false, label: '', count: 0, state: 'a' })
    expect(Object.keys(defaultValues(c))).toHaveLength(4)
  })

  it('is {} for a control-less component', () => {
    expect(defaultValues(comp('x', 'g'))).toEqual({})
  })
})

describe('componentById', () => {
  it('finds by id and returns undefined for a miss', () => {
    const cat = catalogOf(comp('a', 'g'), comp('b', 'g'))
    expect(componentById(cat, 'b')?.id).toBe('b')
    expect(componentById(cat, 'nope')).toBeUndefined()
  })
})

describe('buildSearch', () => {
  const cat = catalogOf(
    comp('button', 'Inputs', [
      { key: 'label', label: 'Label', type: 'text', default: 'Go' },
      { key: 'state', label: 'State', type: 'enum', options: ['primary'], default: 'primary' },
    ]),
    comp('badge', 'Data Display'),
    comp('toggle', 'Inputs', [{ key: 'on', label: 'On', type: 'bool', default: true }]),
  )

  it('returns EVERY id, in catalog order, for a blank query', () => {
    const search = buildSearch(cat)
    expect(search('')).toEqual(['button', 'badge', 'toggle'])
    expect(search('   ')).toEqual(['button', 'badge', 'toggle'])
  })

  it('matches on id substring, case-insensitively', () => {
    const search = buildSearch(cat)
    expect(search('badge')).toEqual(['badge'])
    expect(search('BADGE')).toEqual(['badge'])
  })

  it('returns [] for a query that matches nothing', () => {
    expect(buildSearch(cat)('zzzz-no-such-component')).toEqual([])
  })

  it('preserves catalog order in results (not match order)', () => {
    // `toggle` is declared last, so even if the graph ranks it first the result
    // must stay in catalog order — the sidebar renders groups positionally.
    const search = buildSearch(cat)
    const hits = search('e') // matches several ids by substring
    expect(hits).toEqual(hits.slice().sort((a, b) => search('').indexOf(a) - search('').indexOf(b)))
  })

  it('builds without throwing for a control-less catalog', () => {
    expect(() => buildSearch(catalogOf(comp('bare', 'g')))).not.toThrow()
  })
})
