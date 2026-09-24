import { describe, expect, it } from 'vitest'
import type { WorkbenchCatalog, WorkbenchComponent } from '../catalog'
import { createModel } from '../model'

/**
 * A component OPENS on its Default scenario — all of its args, not just the
 * editable controls.
 *
 * The deployed workbench rendered every data-driven component empty: the
 * canvas read control defaults, the scenario that carried `data` sat one click
 * away in the sidebar, and selecting it filtered its args down to the ones
 * with a control — which `data` never had. The Tree stayed empty either way.
 */
const TREE_DATA = [{ id: 'a', label: 'A' }]

const comp = (over: Partial<WorkbenchComponent> = {}): WorkbenchComponent => ({
  id: 'tree',
  name: 'Tree',
  group: 'Data',
  controls: [{ key: 'label', label: 'Label', type: 'text', default: 'files' }],
  scenarios: [
    { id: 'tree--empty', name: 'Empty', args: { label: '' }, verdict: 'ok' },
    { id: 'tree--default', name: 'Default', args: { data: TREE_DATA, label: 'Files' }, verdict: 'ok' },
  ],
  render: (props) => JSON.stringify(props),
  ...over,
})

const catalog = (c: WorkbenchComponent = comp()): WorkbenchCatalog => ({ components: [c] })

describe('createModel — the opening scenario', () => {
  it('opens on the Default scenario, args included, over the control defaults', () => {
    const m = createModel(catalog(), {})
    expect(m.vals()).toEqual({ label: 'Files', data: TREE_DATA })
  })

  it('opens on the control defaults when no scenario is named Default — a hand catalog\'s first scenario is an extra state', () => {
    const m = createModel(
      catalog(comp({ scenarios: [{ id: 'tree--seeded', name: 'Seeded', args: { data: TREE_DATA }, verdict: 'ok' }] })),
      {},
    )
    expect(m.vals()).toEqual({ label: 'files' })
  })

  it('opens on plain control defaults when there is no scenario at all', () => {
    const m = createModel(catalog(comp({ scenarios: [] })), {})
    expect(m.vals()).toEqual({ label: 'files' })
  })

  it('keeps the rest of the opening scenario when ONE control is edited', () => {
    const m = createModel(catalog(), {})
    m.setValue('tree', 'label', 'Docs')
    expect(m.vals()).toEqual({ label: 'Docs', data: TREE_DATA })
  })

  it('applies EVERY arg of a selected scenario, control or not', () => {
    const m = createModel(catalog(), {})
    m.selectScenario('tree', 'tree--empty')
    expect(m.vals()).toEqual({ label: '' })
    m.selectScenario('tree', 'tree--default')
    expect(m.vals().data).toEqual(TREE_DATA)
  })

  it('reset returns to the opening scenario, not to bare control defaults', () => {
    const m = createModel(catalog(), {})
    m.setValue('tree', 'label', 'Docs')
    m.selectScenario('tree', 'tree--empty')
    m.reset()
    expect(m.vals()).toEqual({ label: 'Files', data: TREE_DATA })
  })
})
