import { afterEach, describe, expect, it } from 'vitest'

// `zeroPlugin()` returns Plugin[] — `[mainPlugin]` for non-SSG modes,
// `[mainPlugin, ssgPlugin]` for `mode: "ssg"`. The first entry is always
// the main plugin and is what these tests inspect.
function getMainPlugin(plugins: any): any {
  return Array.isArray(plugins) ? plugins[0] : plugins
}

// Hoist the heavy import to module scope so the cold-transform cost
// (vite-plugin has ~200ms+ cold transform under CI parallel-load with
// 60+ concurrent vitest workers) is paid ONCE per test file, not per
// `it()` body. Pre-fix: every `it()` did `vitePluginModulePromise`
// — the first to run paid the full cost, occasionally tripping vitest's
// 20s default timeout and flaking the suite. This is the same pattern
// documented in [heavy-eager-import-ci-cold-timeout]: the import IS
// needed at runtime (these tests invoke `zeroPlugin()`), so the lazy-load
// recipe doesn't apply — but module-scope caching amortizes the cost
// across all tests in the file.
const vitePluginModulePromise = import('../vite-plugin')

describe('zero vite-plugin config', () => {
  it('exports zeroPlugin function', async () => {
    const mod = await vitePluginModulePromise
    expect(typeof mod.zeroPlugin).toBe('function')
  })

  it('returns a plugin with correct name', async () => {
    const { zeroPlugin } = await vitePluginModulePromise
    const plugin = getMainPlugin(zeroPlugin())
    expect(plugin.name).toBe('pyreon-zero')
  })

  it('config() returns resolve.conditions with bun', async () => {
    const { zeroPlugin } = await vitePluginModulePromise
    const plugin = getMainPlugin(zeroPlugin())
    const config = plugin.config({ root: process.cwd() })
    expect(config.resolve.conditions).toContain('bun')
  })

  it('config() returns optimizeDeps.exclude array', async () => {
    const { zeroPlugin } = await vitePluginModulePromise
    const plugin = getMainPlugin(zeroPlugin())
    const config = plugin.config({ root: process.cwd() })
    expect(Array.isArray(config.optimizeDeps.exclude)).toBe(true)
  })

  it('returns empty exclude when no @pyreon/ dir in node_modules', async () => {
    const { zeroPlugin } = await vitePluginModulePromise
    const plugin = getMainPlugin(zeroPlugin())
    // Nonexistent root — no @pyreon packages found
    const config = plugin.config({ root: '/tmp/nonexistent-project' })
    expect(config.optimizeDeps.exclude).toEqual([])
  })

  it('config() includes define for __ZERO_MODE__ and __ZERO_BASE__', async () => {
    const { zeroPlugin } = await vitePluginModulePromise
    const plugin = getMainPlugin(zeroPlugin())
    const config = plugin.config({ root: process.cwd() })
    expect(config.define.__ZERO_MODE__).toBeDefined()
    expect(config.define.__ZERO_BASE__).toBeDefined()
  })

  // Port handling — zero-canonical default is 3000 (matches `zero dev`,
  // adapter, and Next.js / Remix / Astro convention). Precedence:
  //   1. Vite CLI `--port N` (argv detection skips plugin default)
  //   2. User `vite.config.ts server: { port: N }` (user beats plugin)
  //   3. `zero({ port: N })` (resolved into config.port)
  //   4. Default 3000
  // The argv-detection layer is load-bearing: PR #579 proved that
  // returning `server.port: 3000` unconditionally clobbered `vite
  // --port 517N --strictPort` in the e2e webServer (memory: vite cli
  // port doesnt override plugin).
  describe('port defaults', () => {
    const originalArgv = process.argv
    afterEach(() => {
      process.argv = originalArgv
    })

    it('defaults to 3000 when no user port and no CLI flag', async () => {
      process.argv = ['/usr/bin/bun', 'vite']
      const { zeroPlugin } = await vitePluginModulePromise
      const plugin = getMainPlugin(zeroPlugin())
      const config = plugin.config({ root: process.cwd() })
      expect(config.server.port).toBe(3000)
    })

    it('honours zero({ port: N }) override', async () => {
      process.argv = ['/usr/bin/bun', 'vite']
      const { zeroPlugin } = await vitePluginModulePromise
      const plugin = getMainPlugin(zeroPlugin({ port: 4242 }))
      const config = plugin.config({ root: process.cwd() })
      expect(config.server.port).toBe(4242)
    })

    it('skips default when CLI passes --port (so CLI value wins)', async () => {
      process.argv = ['/usr/bin/bun', 'vite', '--port', '5173']
      const { zeroPlugin } = await vitePluginModulePromise
      const plugin = getMainPlugin(zeroPlugin())
      const config = plugin.config({ root: process.cwd() })
      expect(config.server).toBeUndefined()
    })

    it('skips default for --port=N form', async () => {
      process.argv = ['/usr/bin/bun', 'vite', '--port=5173']
      const { zeroPlugin } = await vitePluginModulePromise
      const plugin = getMainPlugin(zeroPlugin())
      const config = plugin.config({ root: process.cwd() })
      expect(config.server).toBeUndefined()
    })

    it('skips default for -p short flag', async () => {
      process.argv = ['/usr/bin/bun', 'vite', '-p', '5173']
      const { zeroPlugin } = await vitePluginModulePromise
      const plugin = getMainPlugin(zeroPlugin())
      const config = plugin.config({ root: process.cwd() })
      expect(config.server).toBeUndefined()
    })

    it('explicit zero({ port }) still applies even when CLI has --port', async () => {
      // If the user set port via zero({}), they want plugin to apply it
      // (Vite's merge still lets user vite.config.ts server.port and
      // CLI override on top — this assertion only locks the plugin's
      // OWN return, not the final merged config).
      process.argv = ['/usr/bin/bun', 'vite', '--port', '5173']
      const { zeroPlugin } = await vitePluginModulePromise
      const plugin = getMainPlugin(zeroPlugin({ port: 4242 }))
      const config = plugin.config({ root: process.cwd() })
      expect(config.server.port).toBe(4242)
    })
  })

  describe('argvHasPortFlag helper', () => {
    it('detects --port flag', async () => {
      const { argvHasPortFlag } = await vitePluginModulePromise
      expect(argvHasPortFlag(['node', 'vite', '--port', '5173'])).toBe(true)
    })

    it('detects --port=N form', async () => {
      const { argvHasPortFlag } = await vitePluginModulePromise
      expect(argvHasPortFlag(['node', 'vite', '--port=5173'])).toBe(true)
    })

    it('detects -p short flag', async () => {
      const { argvHasPortFlag } = await vitePluginModulePromise
      expect(argvHasPortFlag(['node', 'vite', '-p', '5173'])).toBe(true)
    })

    it('detects -p=N form', async () => {
      const { argvHasPortFlag } = await vitePluginModulePromise
      expect(argvHasPortFlag(['node', 'vite', '-p=5173'])).toBe(true)
    })

    it('returns false when no port flag present', async () => {
      const { argvHasPortFlag } = await vitePluginModulePromise
      expect(argvHasPortFlag(['node', 'vite', '--mode', 'development'])).toBe(false)
    })

    it('does not match unrelated flags containing "port"', async () => {
      // Defensive: ensure we don't accidentally match `--portfolio`
      // or similar long-form flags that happen to share a prefix.
      const { argvHasPortFlag } = await vitePluginModulePromise
      expect(argvHasPortFlag(['node', 'vite', '--portfolio'])).toBe(false)
    })
  })

  // Each render mode auto-wires its build-time companion plugin:
  //   - `ssg` → ssgPlugin (prerender every path to dist/<path>/index.html)
  //   - `ssr` / `isr` → ssrPlugin (bundle the SSR handler into
  //     dist/server/entry-server.js + dispatch adapter.build)
  //   - `spa` → no companion (SPA ships a client bundle only)
  //
  // These tests target the MODE→COMPANION wiring specifically; the orthogonal
  // image/font auto-wire (default-on) is covered exhaustively by
  // `zero-auto-wire-plugins.test.ts`. We pass `image: false, font: false`
  // here to keep the chain mode-focused — otherwise every length+order
  // assertion below would have to account for two extra plugins.
  describe('mode → companion plugin wiring', () => {
    it('mode: "spa" returns a single-plugin array (no companion needed)', async () => {
      const { zeroPlugin } = await vitePluginModulePromise
      const plugins = zeroPlugin({ mode: 'spa', image: false, font: false }) as any
      expect(Array.isArray(plugins)).toBe(true)
      expect(plugins).toHaveLength(1)
      expect(plugins[0].name).toBe('pyreon-zero')
    })

    it('mode: "ssg" returns main plugin AND ssg plugin', async () => {
      const { zeroPlugin } = await vitePluginModulePromise
      const plugins = zeroPlugin({ mode: 'ssg', image: false, font: false }) as any
      expect(Array.isArray(plugins)).toBe(true)
      expect(plugins).toHaveLength(2)
      expect(plugins[0].name).toBe('pyreon-zero')
      expect(plugins[1].name).toBe('pyreon-zero-ssg')
    })

    it('mode: "ssr" returns main plugin AND ssr plugin', async () => {
      // ssrPlugin auto-wires the SSR bundle build that produces
      // `dist/server/entry-server.js`. Without it, `mode: "ssr"` was
      // types-only — `Adapter.build({ kind: 'ssr' })` was implemented
      // for all 6 adapters but never invoked.
      const { zeroPlugin } = await vitePluginModulePromise
      const plugins = zeroPlugin({ mode: 'ssr', image: false, font: false }) as any
      expect(Array.isArray(plugins)).toBe(true)
      expect(plugins).toHaveLength(2)
      expect(plugins[0].name).toBe('pyreon-zero')
      expect(plugins[1].name).toBe('pyreon-zero-ssr')
    })

    it('mode: "isr" returns main plugin AND ssr plugin (same plugin handles both)', async () => {
      // ISR shares the SSR plugin — `createServer` dispatches mode at
      // runtime via `wireRenderMode`. Same bundle, different runtime
      // wrapper.
      const { zeroPlugin } = await vitePluginModulePromise
      const plugins = zeroPlugin({ mode: 'isr', image: false, font: false }) as any
      expect(Array.isArray(plugins)).toBe(true)
      expect(plugins).toHaveLength(2)
      expect(plugins[0].name).toBe('pyreon-zero')
      expect(plugins[1].name).toBe('pyreon-zero-ssr')
    })

    it('default mode (no config) is "ssr" → returns main plugin AND ssr plugin', async () => {
      // Defaults from `resolveConfig`: `mode: "ssr"`. So the default
      // chain includes the SSR companion.
      const { zeroPlugin } = await vitePluginModulePromise
      const plugins = zeroPlugin({ image: false, font: false }) as any
      expect(Array.isArray(plugins)).toBe(true)
      expect(plugins).toHaveLength(2)
      expect(plugins[0].name).toBe('pyreon-zero')
      expect(plugins[1].name).toBe('pyreon-zero-ssr')
    })
  })
})
