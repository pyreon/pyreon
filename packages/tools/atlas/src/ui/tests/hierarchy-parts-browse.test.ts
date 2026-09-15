import { describe, expect, it } from 'vitest'
import type { WorkbenchComponent } from '../catalog'
import { browseOrder, buildHierarchy, withParts } from '../hierarchy'

const c = (id: string, group = 'Components', over: Partial<WorkbenchComponent> = {}): WorkbenchComponent => ({
  id,
  name: id,
  group,
  controls: [],
  render: () => null,
  ...over,
})

describe('withParts — a part sits under its parent', () => {
  it('moves each part directly after its parent, keeping catalog order otherwise', () => {
    const out = withParts([c('tab-panel', 'x', { partOf: 'tabs' }), c('button'), c('tabs'), c('tab', 'x', { partOf: 'tabs' })])
    expect(out.map((x) => x.id)).toEqual(['button', 'tabs', 'tab-panel', 'tab'])
  })

  it('leaves a part whose parent is not in the list where it was', () => {
    const out = withParts([c('tab-panel', 'x', { partOf: 'tabs' }), c('button')])
    expect(out.map((x) => x.id)).toEqual(['tab-panel', 'button'])
  })

  it('never loops on a component declared a part of itself', () => {
    const out = withParts([c('loop', 'x', { partOf: 'loop' }), c('button')])
    expect(out.map((x) => x.id)).toEqual(['loop', 'button'])
  })
})

describe('browseOrder — what ↑↓ walks', () => {
  const tree = buildHierarchy([
    c('button', 'Actions'),
    c('tabs', 'Navigation'),
    c('tab-panel', 'Navigation', { partOf: 'tabs' }),
    c('link', 'Navigation'),
    c('input', 'Forms/Fields'),
  ])

  it('is depth-first, parts after their parent', () => {
    expect(browseOrder(tree, new Set())).toEqual(['button', 'tabs', 'tab-panel', 'link', 'input'])
  })

  it('skips everything under a collapsed group — a row the sidebar hides is never selected', () => {
    expect(browseOrder(tree, new Set(['Navigation']))).toEqual(['button', 'input'])
    expect(browseOrder(tree, new Set(['Forms']))).toEqual(['button', 'tabs', 'tab-panel', 'link'])
  })
})
