/**
 * `createControlHistory` — which controls a rescan brought in, and when. The
 * Schema panel's "added N min ago" reads it.
 */
import { describe, expect, it } from 'vitest'
import type { ComponentIntelligence, PropControl } from '../../core'
import { generateCatalogModule, toWorkbenchControl } from '../catalog-module'
import { createControlHistory } from '../control-history'

const ctl = (name: string): PropControl => ({ name, kind: 'text', reactive: false, required: false })
const comp = (name: string, controls: string[]): ComponentIntelligence => ({
  name,
  controls: controls.map(ctl),
  axes: [],
  scenarios: [],
  tags: [],
})

describe('control history', () => {
  it('stamps only what a rescan adds — the boot catalog carries no time', () => {
    const h = createControlHistory([comp('Button', ['label'])])
    expect(h.addedAt('Button', 'label')).toBeUndefined()
    h.record([comp('Button', ['label', 'loading'])], 5000)
    expect(h.addedAt('Button', 'label')).toBeUndefined()
    expect(h.addedAt('Button', 'loading')).toBe(5000)
    // A later rescan keeps the first sighting.
    h.record([comp('Button', ['label', 'loading'])], 9000)
    expect(h.addedAt('Button', 'loading')).toBe(5000)
  })

  it('is bounded by the current catalog: a removed control is dropped, and re-added is new again', () => {
    const h = createControlHistory([comp('A', ['x', 'y']), comp('B', ['z'])])
    expect(h.size).toBe(3)
    h.record([comp('A', ['x'])], 100)
    expect(h.size).toBe(1)
    h.record([comp('A', ['x', 'y'])], 200)
    expect(h.addedAt('A', 'y')).toBe(200)
    expect(h.size).toBe(2)
  })

  it('keys by component identity, so two components may share a prop name', () => {
    const h = createControlHistory([comp('A', ['label'])])
    h.record([comp('A', ['label']), comp('B', ['label'])], 7)
    expect(h.addedAt('A', 'label')).toBeUndefined()
    expect(h.addedAt('B', 'label')).toBe(7)
  })
})

describe('provenance and addedAt reach the workbench catalog', () => {
  it('toWorkbenchControl carries the source and the time, and omits both when absent', () => {
    expect(toWorkbenchControl({ ...ctl('label'), source: 'prop-type' }, undefined, 42)).toMatchObject({
      key: 'label',
      source: 'prop-type',
      addedAt: 42,
    })
    const bare = toWorkbenchControl(ctl('label'))
    expect('source' in bare).toBe(false)
    expect('addedAt' in bare).toBe(false)
  })

  it('the generated module emits addedAt for a control the history stamped', () => {
    const c = { ...comp('Button', ['label', 'loading']), source: '/p/Button.tsx' }
    c.controls = c.controls.map((x) => ({ ...x, source: 'prop-type' as const }))
    const code = generateCatalogModule([{ component: c, file: '/p/Button.tsx' }], {
      root: '/p',
      addedAt: (owner, key) => (owner === 'Button' && key === 'loading' ? 1234 : undefined),
    })
    expect(code).toContain('"key":"loading","label":"Loading","type":"text","default":"","source":"prop-type","addedAt":1234')
    expect(code).toContain('"key":"label","label":"Label","type":"text","default":"","source":"prop-type"}')
  })
})
