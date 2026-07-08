import { afterEach, describe, expect, it, vi } from 'vitest'
import { _internal, ssrPlugin } from '../ssr-plugin'
import { renderSsrEntrySource } from '../ssr-build-shared'

describe('ssrPlugin', () => {
  describe('plugin shape', () => {
    it('returns a Vite plugin with the expected name', () => {
      const plugin = ssrPlugin() as any
      expect(plugin.name).toBe('pyreon-zero-ssr')
    })

    it('is build-only (apply: "build")', () => {
      const plugin = ssrPlugin() as any
      expect(plugin.apply).toBe('build')
    })

    it('runs after the main plugin (enforce: "post")', () => {
      const plugin = ssrPlugin() as any
      expect(plugin.enforce).toBe('post')
    })

    it('declares closeBundle hook (the SSR build entry point)', () => {
      const plugin = ssrPlugin() as any
      expect(typeof plugin.closeBundle).toBe('function')
    })

    it('exposes a stable SSR entry filename for the materialized sub-build entry', () => {
      // The plugin writes a temporary `__pyreon-zero-ssr-entry.js`
      // file at the project root for the SSR sub-build. The name must
      // start with `__` so it doesn't collide with user route files
      // (which never start with double underscore). Distinct from
      // SSG's filename so the two plugins can never overwrite each
      // other's synthetic entry on a multi-mode build orchestration.
      expect(_internal.SSR_ENTRY_FILENAME).toMatch(/^__/)
      expect(_internal.SSR_ENTRY_FILENAME).toMatch(/\.js$/)
      expect(_internal.SSR_ENTRY_FILENAME).toContain('ssr')
    })

    it('uses a per-mode env-flag namespace distinct from SSG', () => {
      // SSR and SSG each own their own gate — cross-mode flag-leak
      // failure class is structurally impossible.
      expect(_internal.SSR_BUILD_FLAG).toBe('PYREON_ZERO_SSR_INNER_BUILD')
      expect(_internal.SSR_BUILD_FLAG).not.toBe('PYREON_ZERO_SSG_INNER_BUILD')
    })

    it('knows the SSG inner-build flag (to skip during SSG prerender)', () => {
      expect(_internal.SSG_BUILD_FLAG).toBe('PYREON_ZERO_SSG_INNER_BUILD')
    })

    it('outputs to dist/server/entry-server.js (matches adapters/validate.ts contract)', () => {
      // `entry-server.js` (NOT `.mjs`) — `package.json` `"type":
      // "module"` makes `.js` ESM. Adapters expect this filename per
      // `adapters/validate.ts:validateBuildInputs`.
      expect(_internal.SSR_OUTPUT_FILENAME).toBe('entry-server.js')
      expect(_internal.SSR_OUT_SUBDIR).toBe('server')
    })
  })

  // Regression: in mode:'ssr'|'isr', the SSG plugin runs a prerender sub-build
  // to `<dist>/.zero-ssg-server` (with PYREON_ZERO_SSG_INNER_BUILD=1). The SSR
  // post-step's closeBundle must NOT fire there — its outDir has no client
  // index.html, so the check emitted a MISLEADING "Skipping SSR build" warning
  // even though the real (outer) SSR build succeeds. Reproduced on the default
  // ssr-showcase build; fixed by honoring the SSG flag symmetrically.
  describe('closeBundle skips during the SSG prerender sub-build', () => {
    const RESOLVED = {
      root: '/tmp/pyreon-nonexistent-root',
      build: { outDir: 'dist', assetsInlineLimit: 0, assetsDir: 'assets' },
      base: '/',
      plugins: [],
    }
    afterEach(() => {
      delete process.env.PYREON_ZERO_SSG_INNER_BUILD
      vi.restoreAllMocks()
    })

    it('does NOT warn "Skipping SSR build" when the SSG inner-build flag is set', async () => {
      process.env.PYREON_ZERO_SSG_INNER_BUILD = '1'
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const plugin = ssrPlugin({ mode: 'ssr' }) as any
      plugin.configResolved(RESOLVED)
      await plugin.closeBundle()
      expect(warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Skipping SSR build'),
        ...([] as unknown[]),
      )
    })

    it('DOES reach the check (and warns) when NO inner-build flag is set', async () => {
      // Proves the test setup actually reaches the client-index.html check —
      // so the skip above is meaningful, not a vacuous pass.
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const plugin = ssrPlugin({ mode: 'ssr' }) as any
      plugin.configResolved(RESOLVED)
      await plugin.closeBundle()
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Skipping SSR build'),
        ...([] as unknown[]),
      )
    })
  })

  describe('SSR entry source generation', () => {
    it('SSR kind emits the canonical createServer body with all 3 virtual modules', () => {
      const src = renderSsrEntrySource({ kind: 'ssr', locales: [] })
      // Must import the three virtual modules the user's
      // `entry-server.ts` standardly imports.
      expect(src).toContain('virtual:zero/routes')
      expect(src).toContain('virtual:zero/route-middleware')
      expect(src).toContain('virtual:zero/api-routes')
      // Must wire through createServer (not createApp directly — SSR
      // needs the full middleware chain).
      expect(src).toContain('createServer')
      expect(src).toContain('@pyreon/zero/server')
      expect(src).toContain('export default')
      // Must NOT inline locale-walking logic — that's SSG-only.
      expect(src).not.toContain('__renderNotFound')
      expect(src).not.toContain('createApp')
    })

    it('ISR kind emits the same canonical entry as SSR (mode dispatch happens at runtime)', () => {
      // `createServer` calls `wireRenderMode(config.mode, ...)`
      // internally — same synthetic entry works for both 'ssr' and
      // 'isr'. The runtime decides which wrapper applies.
      const ssrSrc = renderSsrEntrySource({ kind: 'ssr', locales: [] })
      const isrSrc = renderSsrEntrySource({ kind: 'isr', locales: [] })
      expect(isrSrc).toBe(ssrSrc)
    })

    it('SSG kind delegates to the registered SSG-specific renderer', async () => {
      // The SSG plugin registers its locale-aware renderer at module
      // load via `_registerSsgEntryRenderer`. Importing ssg-plugin
      // (the side effect at module load) wires it up.
      await import('../ssg-plugin')
      const src = renderSsrEntrySource({ kind: 'ssg', locales: ['en', 'de'] })
      // SSG-specific markers: locale array baked in, per-path renderer
      // (createApp), 404 walker.
      expect(src).toContain('createApp')
      expect(src).toContain('__renderNotFound')
      expect(src).toContain('"en"')
      expect(src).toContain('"de"')
    })
  })

  describe('mode gating', () => {
    it('returns plugin with closeBundle even for ssg mode (gating is inside the hook body)', () => {
      // The early-return runs inside `closeBundle` at invocation time
      // — the plugin object itself always has the hook defined so
      // Vite's plugin chain processing is uniform. SSG/SPA users get
      // a hook that no-ops fast.
      const plugin = ssrPlugin({ mode: 'ssg' }) as any
      expect(typeof plugin.closeBundle).toBe('function')
    })
  })

  describe('shared internal exports parity', () => {
    it('ssrPlugin _internal does not leak the shared mkdir / atomic helpers', () => {
      // The shared atomic-write / mkdir-cache helpers are owned by
      // `ssr-build-shared.ts` and re-exposed via SSG's `_internal`
      // for tests. The SSR plugin doesn't need to re-export them —
      // checking the surface stays tight.
      expect((_internal as Record<string, unknown>).writeFileAtomic).toBeUndefined()
      expect((_internal as Record<string, unknown>).mkdirOnce).toBeUndefined()
    })
  })
})
