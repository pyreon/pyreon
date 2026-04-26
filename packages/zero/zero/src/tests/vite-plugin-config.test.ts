import { describe, expect, it } from 'vitest'

// `zeroPlugin()` returns Plugin[] — `[mainPlugin]` for non-SSG modes,
// `[mainPlugin, ssgPlugin]` for `mode: "ssg"`. The first entry is always
// the main plugin and is what these tests inspect.
function getMainPlugin(plugins: any): any {
  return Array.isArray(plugins) ? plugins[0] : plugins
}

describe('zero vite-plugin config', () => {
  it('exports zeroPlugin function', async () => {
    const mod = await import('../vite-plugin')
    expect(typeof mod.zeroPlugin).toBe('function')
  })

  it('returns a plugin with correct name', async () => {
    const { zeroPlugin } = await import('../vite-plugin')
    const plugin = getMainPlugin(zeroPlugin())
    expect(plugin.name).toBe('pyreon-zero')
  })

  it('config() returns resolve.conditions with bun', async () => {
    const { zeroPlugin } = await import('../vite-plugin')
    const plugin = getMainPlugin(zeroPlugin())
    const config = plugin.config({ root: process.cwd() })
    expect(config.resolve.conditions).toContain('bun')
  })

  it('config() returns optimizeDeps.exclude array', async () => {
    const { zeroPlugin } = await import('../vite-plugin')
    const plugin = getMainPlugin(zeroPlugin())
    const config = plugin.config({ root: process.cwd() })
    expect(Array.isArray(config.optimizeDeps.exclude)).toBe(true)
  })

  it('returns empty exclude when no @pyreon/ dir in node_modules', async () => {
    const { zeroPlugin } = await import('../vite-plugin')
    const plugin = getMainPlugin(zeroPlugin())
    // Nonexistent root — no @pyreon packages found
    const config = plugin.config({ root: '/tmp/nonexistent-project' })
    expect(config.optimizeDeps.exclude).toEqual([])
  })

  it('config() includes define for __ZERO_MODE__ and __ZERO_BASE__', async () => {
    const { zeroPlugin } = await import('../vite-plugin')
    const plugin = getMainPlugin(zeroPlugin())
    const config = plugin.config({ root: process.cwd() })
    expect(config.define.__ZERO_MODE__).toBeDefined()
    expect(config.define.__ZERO_BASE__).toBeDefined()
  })

  // SSG mode auto-wires `ssgPlugin` into the plugin chain alongside the
  // main plugin. Without it, `mode: "ssg"` was types-only — `ssg.paths`
  // never reached a build hook and no per-route HTML was emitted.
  describe('SSG mode wiring', () => {
    it('non-SSG modes return a single-plugin array', async () => {
      const { zeroPlugin } = await import('../vite-plugin')
      const plugins = zeroPlugin({ mode: 'ssr' }) as any
      expect(Array.isArray(plugins)).toBe(true)
      expect(plugins).toHaveLength(1)
      expect(plugins[0].name).toBe('pyreon-zero')
    })

    it('mode: "ssg" returns main plugin AND ssg plugin', async () => {
      const { zeroPlugin } = await import('../vite-plugin')
      const plugins = zeroPlugin({ mode: 'ssg' }) as any
      expect(Array.isArray(plugins)).toBe(true)
      expect(plugins).toHaveLength(2)
      expect(plugins[0].name).toBe('pyreon-zero')
      expect(plugins[1].name).toBe('pyreon-zero-ssg')
    })

    it('default mode (no config) returns single-plugin array', async () => {
      const { zeroPlugin } = await import('../vite-plugin')
      const plugins = zeroPlugin() as any
      expect(Array.isArray(plugins)).toBe(true)
      expect(plugins).toHaveLength(1)
    })
  })
})
