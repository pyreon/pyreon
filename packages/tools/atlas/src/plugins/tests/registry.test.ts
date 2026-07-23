import type { ComponentIntelligence } from '../../core'
import { createCatalogGraph, makeScenario } from '../../core'
import type { AtlasPlugin } from '../types'
import { createPluginRegistry, emptyVerdict } from '../registry'

const ci = (name: string): ComponentIntelligence => ({
  name,
  controls: [],
  axes: [],
  reactivity: [],
  scenarios: [],
  tags: [],
})

describe('emptyVerdict', () => {
  it('is all-skip and ok', () => {
    const v = emptyVerdict()
    expect(v.ok).toBe(true)
    expect(v.a11y.status).toBe('skip')
    expect(v.snapshot.status).toBe('skip')
  })
})

describe('createPluginRegistry', () => {
  it('exposes the plugins list', () => {
    const p: AtlasPlugin = { name: 'x' }
    expect(createPluginRegistry([p]).plugins).toEqual([p])
  })

  it('runDiscover concatenates results and skips plugins without a discover hook', async () => {
    const reg = createPluginRegistry([
      { name: 'a', discover: () => [ci('A')] },
      { name: 'b' },
      { name: 'c', discover: async () => [ci('C')] },
    ])
    const out = await reg.runDiscover({ cwd: '.' })
    expect(out.map((c) => c.name)).toEqual(['A', 'C'])
  })

  it('runDecorate folds a component through each decorate hook', async () => {
    const reg = createPluginRegistry([
      { name: 'tag-a', decorate: (c) => ({ ...c, tags: [...c.tags, 'a'] }) },
      { name: 'noop' },
      { name: 'tag-b', decorate: async (c) => ({ ...c, tags: [...c.tags, 'b'] }) },
    ])
    const out = await reg.runDecorate(ci('X'), { cwd: '.' })
    expect(out.tags).toEqual(['a', 'b'])
  })

  it('runVerify merges partial verdicts, and a single fail drives ok to false', async () => {
    const reg = createPluginRegistry([
      { name: 'pass', verify: () => ({ a11y: { status: 'pass' } }) },
      { name: 'skip-only' },
      { name: 'fail', verify: async () => ({ interaction: { status: 'fail', findings: ['boom'] } }) },
    ])
    const v = await reg.runVerify({
      scenario: makeScenario({ component: 'X', name: 's' }),
      component: ci('X'),
    })
    expect(v.a11y.status).toBe('pass')
    expect(v.interaction.status).toBe('fail')
    expect(v.ok).toBe(false)
  })

  it('runVerify stays ok when every check passes or skips', async () => {
    const reg = createPluginRegistry([{ name: 'p', verify: () => ({ a11y: { status: 'pass' } }) }])
    const v = await reg.runVerify({
      scenario: makeScenario({ component: 'X', name: 's' }),
      component: ci('X'),
    })
    expect(v.ok).toBe(true)
  })

  it('runGraph runs each graph hook in order and skips plugins without one', async () => {
    const calls: string[] = []
    const reg = createPluginRegistry([
      { name: 'g1', graph: () => void calls.push('g1') },
      { name: 'noop' },
      { name: 'g2', graph: async () => void calls.push('g2') },
    ])
    await reg.runGraph({ graph: createCatalogGraph() })
    expect(calls).toEqual(['g1', 'g2'])
  })
})
