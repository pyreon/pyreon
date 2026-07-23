import type { ComponentIntelligence } from '../../core'
import { createCatalogGraph } from '../../core'
import type { AgentAsset } from '../ai-assets'
import { aiAssetsPlugin } from '../ai-assets'

const ci = (over: Partial<ComponentIntelligence> & { name: string }): ComponentIntelligence => ({
  controls: [],
  axes: [],
  reactivity: [],
  scenarios: [],
  tags: [],
  ...over,
})

describe('aiAssetsPlugin', () => {
  it('generates the guide + llms + catalog and hands them to onAsset', async () => {
    let asset: AgentAsset | undefined
    const graph = createCatalogGraph([ci({ name: 'Button', tags: ['form'] })])
    await aiAssetsPlugin({
      onAsset: (a) => {
        asset = a
      },
    }).graph!({ graph })

    expect(asset).toBeDefined()
    expect(asset!.guide).toContain('# Agent Guide')
    expect(asset!.guide).toContain('## Button [form]')
    expect(asset!.llms).toContain('# Component Catalog')
    expect(asset!.catalog.version).toBe(1)
    expect(asset!.catalog.components).toHaveLength(1)
  })

  it('is a no-op without an onAsset sink', () => {
    const graph = createCatalogGraph()
    expect(() => aiAssetsPlugin().graph!({ graph })).not.toThrow()
  })
})
