import { describe, expect, it } from 'vitest'

describe('index exports', () => {
  it('exports Container', async () => {
    const mod = await import('../index')
    expect(mod.Container).toBeDefined()
    expect(typeof mod.Container).toBe('function')
  })

  it('exports Row', async () => {
    const mod = await import('../index')
    expect(mod.Row).toBeDefined()
    expect(typeof mod.Row).toBe('function')
  })

  it('exports Col', async () => {
    const mod = await import('../index')
    expect(mod.Col).toBeDefined()
    expect(typeof mod.Col).toBe('function')
  })

  it('does not export the removed Provider (use PyreonUI from @pyreon/ui-core)', async () => {
    const mod = await import('../index')
    expect('Provider' in mod).toBe(false)
  })

  it('exports theme', async () => {
    const mod = await import('../index')
    expect(mod.theme).toBeDefined()
    expect(mod.theme).toHaveProperty('rootSize')
    expect(mod.theme).toHaveProperty('breakpoints')
    expect(mod.theme).toHaveProperty('grid')
  })
})
