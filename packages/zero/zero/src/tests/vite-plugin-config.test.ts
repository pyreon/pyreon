import { describe, expect, it } from 'vitest'

describe('zero vite-plugin config', () => {
  it('exports zeroPlugin function', async () => {
    const mod = await import('../vite-plugin')
    expect(typeof mod.zeroPlugin).toBe('function')
  })

  it('returns a plugin with correct name', async () => {
    const { zeroPlugin } = await import('../vite-plugin')
    const plugin = zeroPlugin() as any
    expect(plugin.name).toBe('pyreon-zero')
  })

  it('config() returns resolve.conditions with bun', async () => {
    const { zeroPlugin } = await import('../vite-plugin')
    const plugin = zeroPlugin() as any
    const config = plugin.config({ root: process.cwd() })
    expect(config.resolve.conditions).toContain('bun')
  })

  it('config() returns optimizeDeps.exclude array', async () => {
    const { zeroPlugin } = await import('../vite-plugin')
    const plugin = zeroPlugin() as any
    const config = plugin.config({ root: process.cwd() })
    expect(Array.isArray(config.optimizeDeps.exclude)).toBe(true)
  })

  it('returns empty exclude when no @pyreon/ dir in node_modules', async () => {
    const { zeroPlugin } = await import('../vite-plugin')
    const plugin = zeroPlugin() as any
    // Nonexistent root — no @pyreon packages found
    const config = plugin.config({ root: '/tmp/nonexistent-project' })
    expect(config.optimizeDeps.exclude).toEqual([])
  })

  it('config() includes define for __ZERO_MODE__ and __ZERO_BASE__', async () => {
    const { zeroPlugin } = await import('../vite-plugin')
    const plugin = zeroPlugin() as any
    const config = plugin.config({ root: process.cwd() })
    expect(config.define.__ZERO_MODE__).toBeDefined()
    expect(config.define.__ZERO_BASE__).toBeDefined()
  })
})
