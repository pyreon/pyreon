/**
 * `activeScenario` is what the sidebar highlights. With no edits it names the
 * `Default` scenario the component opened on; any edit means the canvas no
 * longer shows a named scenario, and no `Default` (or no component) means there
 * is nothing to name.
 */
import { describe, expect, it } from 'vitest'
import type { WorkbenchCatalog, WorkbenchComponent } from '../catalog'
import { createModel } from '../model'

const comp = (over: Partial<WorkbenchComponent> = {}): WorkbenchComponent => ({
  id: 'tree',
  name: 'Tree',
  group: 'Data',
  controls: [{ key: 'label', label: 'Label', type: 'text', default: 'files' }],
  scenarios: [
    { id: 'tree--empty', name: 'Empty', args: { label: '' }, verdict: 'ok' },
    { id: 'tree--default', name: 'Default', args: { label: 'Files' }, verdict: 'ok' },
  ],
  render: (props) => JSON.stringify(props),
  ...over,
})
const catalog = (...c: WorkbenchComponent[]): WorkbenchCatalog => ({ components: c })

describe('activeScenario', () => {
  it('names Default while nothing is edited, and nothing once a control is', () => {
    const m = createModel(catalog(comp()), {})
    expect(m.activeScenario()).toBe('tree--default')
    m.setValue('tree', 'label', 'Docs')
    expect(m.activeScenario()).toBeNull()
  })

  it('is null without a Default scenario, without scenarios, and without a component', () => {
    const noDefault = comp({ scenarios: [{ id: 'tree--empty', name: 'Empty', args: {}, verdict: 'ok' }] })
    expect(createModel(catalog(noDefault), {}).activeScenario()).toBeNull()
    const { scenarios: _drop, ...bare } = comp()
    expect(createModel(catalog(bare as WorkbenchComponent), {}).activeScenario()).toBeNull()
    expect(createModel(catalog(), {}).activeScenario()).toBeNull()
  })
})
