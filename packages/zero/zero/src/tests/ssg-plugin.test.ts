import { afterEach, describe, expect, it, vi } from 'vitest'
import { SSG_BUILD_FLAG, SSR_BUILD_FLAG, _enterInnerBuild, _exitInnerBuild } from '../build-flags'
import { _internal, ssgPlugin } from '../ssg-plugin'

describe('ssgPlugin', () => {
  describe('plugin shape', () => {
    it('returns a Vite plugin with the expected name', () => {
      const plugin = ssgPlugin() as any
      expect(plugin.name).toBe('pyreon-zero-ssg')
    })

    it('is build-only (apply: "build")', () => {
      const plugin = ssgPlugin() as any
      expect(plugin.apply).toBe('build')
    })

    it('runs after the main plugin (enforce: "post")', () => {
      const plugin = ssgPlugin() as any
      expect(plugin.enforce).toBe('post')
    })

    it('declares closeBundle hook (the SSG entry point)', () => {
      const plugin = ssgPlugin() as any
      expect(typeof plugin.closeBundle).toBe('function')
    })

    it('exposes a stable SSR entry filename for the materialized sub-build entry', () => {
      // The plugin writes a temporary `__pyreon-zero-ssg-entry.js` file at
      // the project root for the SSR sub-build. The name must start with
      // `__` so it doesn't collide with user route files (which never start
      // with double underscore).
      expect(_internal.SSR_ENTRY_FILENAME).toMatch(/^__/)
      expect(_internal.SSR_ENTRY_FILENAME).toMatch(/\.js$/)
    })

    it('SSR entry source imports zero virtual modules and renders fresh per path', () => {
      // The materialized entry must (Phase 1 render-pipeline unification):
      // 1. Import the virtual route tree
      // 2. Use `createApp({ url: path })` to get a fresh router PER REQUEST
      //    (NOT createServer, which bakes in a single router that always
      //    points at "/")
      // 3. Delegate the per-page sequence (preload → redirect catch →
      //    render → styler → loader script) to the SHARED `renderPage`
      //    from @pyreon/server — the same pipeline the production handler
      //    and dev SSR middleware run. The entry must NOT hand-roll the
      //    sequence (that was the drift class renderPage closed).
      // 4. Default-export the renderer
      expect(_internal.renderSsrEntrySource()).toContain('virtual:zero/routes')
      expect(_internal.renderSsrEntrySource()).toContain('@pyreon/zero/server')
      expect(_internal.renderSsrEntrySource()).toContain('createApp')
      expect(_internal.renderSsrEntrySource()).toContain('url: path')
      expect(_internal.renderSsrEntrySource()).toContain('renderPage')
      expect(_internal.renderSsrEntrySource()).toContain('"@pyreon/server"')
      expect(_internal.renderSsrEntrySource()).toContain('export default')
      // Must NOT use createServer — that's the bug we fixed (single-router
      // instance baked in at app creation, can't render different paths).
      expect(_internal.renderSsrEntrySource()).not.toContain('createServer')
      // Must NOT hand-roll the routed render sequence — renderPage owns it.
      // (The legacy router-less standalone-404 fallback below renderPath is
      // the ONLY remaining renderWithHead consumer; scope the assertion to
      // the renderPath function body.)
      const entry = _internal.renderSsrEntrySource()
      const renderPathBody = entry.slice(
        entry.indexOf('export default async function renderPath'),
        entry.indexOf('// ─── getStaticPaths'),
      )
      expect(renderPathBody).toContain('renderPage(App, router, path')
      expect(renderPathBody).not.toContain('renderWithHead')
      expect(renderPathBody).not.toContain('runWithRequestContext')
      expect(renderPathBody).not.toContain('serializeLoaderData')
    })
  })

  describe('path resolution', () => {
    it('explicit string[] paths returned verbatim', async () => {
      const paths = await _internal.resolvePaths(
        { mode: 'ssg', ssg: { paths: ['/', '/a', '/b'] } },
        '/tmp/nonexistent-routes',
      )
      expect(paths).toEqual(['/', '/a', '/b'])
    })

    it('async function paths awaited', async () => {
      const paths = await _internal.resolvePaths(
        { mode: 'ssg', ssg: { paths: async () => ['/x', '/y'] } },
        '/tmp/nonexistent-routes',
      )
      expect(paths).toEqual(['/x', '/y'])
    })

    it('sync function paths invoked', async () => {
      const paths = await _internal.resolvePaths(
        { mode: 'ssg', ssg: { paths: () => ['/sync'] } },
        '/tmp/nonexistent-routes',
      )
      expect(paths).toEqual(['/sync'])
    })

    it('falls back to "/" when no paths and no routes dir', async () => {
      const paths = await _internal.resolvePaths(
        { mode: 'ssg' },
        '/tmp/nonexistent-routes-fallback',
      )
      expect(paths).toEqual(['/'])
    })
  })

  // ssg.format — which on-disk file(s) a route writes. The pure target
  // selector is the load-bearing decision; `writeRouteOutputs` just writes
  // every returned target byte-identically.
  describe('needsSpaFallbackShell', () => {
    // A DYNAMIC 'spa' route can't be enumerated to a concrete dist/ file, so it
    // needs a catch-all `dist/404.html` SPA shell to serve on a direct URL —
    // the fix that makes hn-clone's client-`useQuery` `item/[id]` work on a
    // static host without manual config.
    it('TRUE for a dynamic spa route (param in pattern)', () => {
      expect(_internal.needsSpaFallbackShell([{ pattern: '/item/:id', mode: 'spa', declared: true }])).toBe(true)
    })

    it('TRUE for a catch-all spa route', () => {
      expect(_internal.needsSpaFallbackShell([{ pattern: '/docs/:slug*', mode: 'spa', declared: true }])).toBe(true)
    })

    it('FALSE for a STATIC spa route (gets its own per-path shell)', () => {
      expect(_internal.needsSpaFallbackShell([{ pattern: '/dashboard', mode: 'spa', declared: true }])).toBe(false)
    })

    it('FALSE for a dynamic route that is NOT spa (ssg/ssr enumerate or server-render)', () => {
      expect(_internal.needsSpaFallbackShell([{ pattern: '/posts/:id', mode: 'ssg', declared: true }])).toBe(false)
      expect(_internal.needsSpaFallbackShell([{ pattern: '/posts/:id', mode: 'ssr', declared: true }])).toBe(false)
    })

    it('FALSE for empty / undefined entries', () => {
      expect(_internal.needsSpaFallbackShell([])).toBe(false)
      expect(_internal.needsSpaFallbackShell(undefined)).toBe(false)
    })

    it('TRUE when at least one of several routes is a dynamic spa route', () => {
      expect(
        _internal.needsSpaFallbackShell([
          { pattern: '/', mode: 'ssg', declared: false },
          { pattern: '/dashboard', mode: 'spa', declared: true },
          { pattern: '/item/:id', mode: 'spa', declared: true },
        ]),
      ).toBe(true)
    })
  })

  describe('selectSsgTargets (ssg.format)', () => {
    const D = '/dist'

    it("'directory' (default) → only <route>/index.html", () => {
      expect(_internal.selectSsgTargets(D, '/resume', 'directory')).toEqual([
        '/dist/resume/index.html',
      ])
      expect(_internal.selectSsgTargets(D, '/blog/post', 'directory')).toEqual([
        '/dist/blog/post/index.html',
      ])
    })

    it("'file' → only <route>.html (Next.js export style)", () => {
      expect(_internal.selectSsgTargets(D, '/resume', 'file')).toEqual(['/dist/resume.html'])
      expect(_internal.selectSsgTargets(D, '/blog/post', 'file')).toEqual([
        '/dist/blog/post.html',
      ])
    })

    it("'both' → directory form AND file form (the no-301 opt-in)", () => {
      expect(_internal.selectSsgTargets(D, '/resume', 'both')).toEqual([
        '/dist/resume/index.html',
        '/dist/resume.html',
      ])
      expect(_internal.selectSsgTargets(D, '/blog/post', 'both')).toEqual([
        '/dist/blog/post/index.html',
        '/dist/blog/post.html',
      ])
    })

    it('root (/) is ALWAYS dist/index.html — no dist/.html for any format', () => {
      for (const fmt of ['directory', 'file', 'both'] as const) {
        expect(_internal.selectSsgTargets(D, '/', fmt)).toEqual(['/dist/index.html'])
      }
    })

    it('an already-.html path is its own single canonical target for any format', () => {
      for (const fmt of ['directory', 'file', 'both'] as const) {
        expect(_internal.selectSsgTargets(D, '/feed.html', fmt)).toEqual(['/dist/feed.html'])
      }
    })

    it("'both' emits each route's two forms at sibling paths (no nesting collision)", () => {
      // /blog (a page) coexisting with /blog/post (a child) under 'both':
      // dist/blog.html + dist/blog/index.html, and dist/blog/post.html +
      // dist/blog/post/index.html — all distinct files, no overwrite.
      const blog = _internal.selectSsgTargets(D, '/blog', 'both')
      const post = _internal.selectSsgTargets(D, '/blog/post', 'both')
      expect(new Set([...blog, ...post]).size).toBe(4)
    })
  })

  describe('expandUrlPattern', () => {
    it('substitutes a single :param', () => {
      expect(_internal.expandUrlPattern('/posts/:id', { id: 'a' })).toBe('/posts/a')
    })

    it('substitutes multiple :params', () => {
      expect(_internal.expandUrlPattern('/users/:userId/posts/:postId', { userId: '1', postId: '2' })).toBe(
        '/users/1/posts/2',
      )
    })

    it('expands a catch-all :param* preserving slashes', () => {
      expect(_internal.expandUrlPattern('/blog/:slug*', { slug: 'a/b/c' })).toBe('/blog/a/b/c')
    })

    it('throws when a required param is missing', () => {
      expect(() => _internal.expandUrlPattern('/posts/:id', {})).toThrow(/without "id"/)
    })

    it('throws on empty-string value (would produce ambiguous URL)', () => {
      expect(() => _internal.expandUrlPattern('/posts/:id', { id: '' })).toThrow(/without "id"/)
    })

    it('rejects a path-escaping value in a non-catch-all segment (slash / traversal)', () => {
      // A single :param is ONE URL segment and becomes a dist/<path>/
      // index.html write target. An unsanitized CMS slug containing "/"
      // or "." / ".." would escape the intended structure.
      expect(() => _internal.expandUrlPattern('/posts/:slug', { slug: 'a/b' })).toThrow(/unsafe "slug"/)
      expect(() => _internal.expandUrlPattern('/posts/:slug', { slug: '..' })).toThrow(/unsafe "slug"/)
      expect(() => _internal.expandUrlPattern('/posts/:slug', { slug: '.' })).toThrow(/unsafe "slug"/)
      expect(() => _internal.expandUrlPattern('/posts/:slug', { slug: '../../etc' })).toThrow(
        /unsafe "slug"/,
      )
    })

    it('catch-all keeps multi-segment values but still rejects "." / ".." traversal', () => {
      // Catch-all legitimately spans segments…
      expect(_internal.expandUrlPattern('/blog/:rest*', { rest: 'a/b/c' })).toBe('/blog/a/b/c')
      // …but a traversal segment inside it is still rejected.
      expect(() => _internal.expandUrlPattern('/blog/:rest*', { rest: 'a/../secret' })).toThrow(
        /unsafe "rest"/,
      )
    })

    it('passes through static segments unchanged', () => {
      expect(_internal.expandUrlPattern('/static/path', {})).toBe('/static/path')
    })
  })

  describe('autoDetectStaticPaths with getStaticPaths', () => {
    it('warns loudly for a dynamic route with no getStaticPaths (silent-missing-page fix)', async () => {
      const f = makeFixture({
        'index.tsx': 'export default () => null',
        'posts/[id].tsx': 'export default () => null',
      })
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const paths = await _internal.autoDetectStaticPaths(f.routesDir, new Map() as any, [])
        expect(paths).not.toContain('/posts/:id')
        const messages = warn.mock.calls.map((c) => String(c[0]))
        const hit = messages.find((m) => m.includes('posts/[id].tsx'))
        expect(hit).toBeDefined()
        expect(hit).toContain('no page will be emitted')
        expect(hit).toContain('getStaticPaths')
        expect(hit).toContain("renderMode = 'spa'")
      } finally {
        warn.mockRestore()
        f.cleanup()
      }
    })

    it("does NOT warn when the route declares renderMode 'spa' (intentional CSR shell)", async () => {
      const f = makeFixture({
        'index.tsx': 'export default () => null',
        'app/[id].tsx': "export default () => null\nexport const renderMode = 'spa'",
      })
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        await _internal.autoDetectStaticPaths(f.routesDir, new Map() as any, [])
        const messages = warn.mock.calls.map((c) => String(c[0]))
        expect(messages.find((m) => m.includes('app/[id].tsx'))).toBeUndefined()
      } finally {
        warn.mockRestore()
        f.cleanup()
      }
    })

    it('does NOT warn for dynamic API routes (runtime-only by definition)', async () => {
      const f = makeFixture({
        'index.tsx': 'export default () => null',
        'api/items/[id].ts': 'export function GET() { return new Response("ok") }',
      })
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        await _internal.autoDetectStaticPaths(f.routesDir, new Map() as any, [])
        const messages = warn.mock.calls.map((c) => String(c[0]))
        expect(messages.find((m) => m.includes('api/items'))).toBeUndefined()
      } finally {
        warn.mockRestore()
        f.cleanup()
      }
    })


    // We exercise autoDetectStaticPaths against a fixture directory built
    // on-the-fly with mkdtempSync. Each test writes a minimal route tree,
    // optionally a getStaticPaths registry, and asserts the expanded paths.
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs')
    const { tmpdir } = require('node:os')
    const path = require('node:path')

    function makeFixture(files: Record<string, string>) {
      const root = mkdtempSync(path.join(tmpdir(), 'pyreon-ssg-fixture-'))
      for (const [rel, body] of Object.entries(files)) {
        const full = path.join(root, rel)
        mkdirSync(path.dirname(full), { recursive: true })
        writeFileSync(full, body)
      }
      return {
        routesDir: root,
        cleanup: () => rmSync(root, { recursive: true, force: true }),
      }
    }

    it('expands a dynamic route via getStaticPaths', async () => {
      const f = makeFixture({
        'index.tsx': 'export default () => null',
        'posts/[id].tsx': 'export default () => null\nexport function getStaticPaths() {}',
      })
      try {
        // The fs-router scanner picks up `getStaticPaths` from the route
        // file; the SSG plugin pulls the actual function from the registry
        // (which the SSR sub-build's compiled output exposes). For the
        // unit test we hand-build the registry to mirror that contract.
        const registry = new Map<string, () => Array<{ params: Record<string, string> }>>([
          ['/posts/:id', () => [{ params: { id: 'a' } }, { params: { id: 'b' } }]],
        ])
        const errors: { path: string; error: unknown }[] = []
        const paths = await _internal.autoDetectStaticPaths(f.routesDir, registry as any, errors)
        expect(paths).toContain('/')
        expect(paths).toContain('/posts/a')
        expect(paths).toContain('/posts/b')
        expect(errors).toEqual([])
      } finally {
        f.cleanup()
      }
    })

    it('dedups duplicate concrete paths from getStaticPaths (no double render)', async () => {
      // Regression: a getStaticPaths returning the same slug twice (CMS
      // duplicate, pagination overlap) previously pushed the path twice
      // → rendered dist/posts/a/index.html twice (wasted work + last-
      // write race) and fed a duplicate into the SSG→sitemap merge.
      const f = makeFixture({
        'index.tsx': 'export default () => null',
        'posts/[id].tsx': 'export default () => null\nexport function getStaticPaths() {}',
      })
      try {
        const registry = new Map<string, () => Array<{ params: Record<string, string> }>>([
          [
            '/posts/:id',
            () => [{ params: { id: 'a' } }, { params: { id: 'a' } }, { params: { id: 'b' } }],
          ],
        ])
        const errors: { path: string; error: unknown }[] = []
        const paths = await _internal.autoDetectStaticPaths(f.routesDir, registry as any, errors)
        expect(paths.filter((p) => p === '/posts/a')).toHaveLength(1) // not 2
        expect(paths).toContain('/posts/b')
        expect(new Set(paths).size).toBe(paths.length) // fully unique
        expect(errors).toEqual([])
      } finally {
        f.cleanup()
      }
    })

    it('skips dynamic routes silently when no getStaticPaths is registered', async () => {
      const f = makeFixture({
        'index.tsx': 'export default () => null',
        'posts/[id].tsx': 'export default () => null',
      })
      try {
        const errors: { path: string; error: unknown }[] = []
        const paths = await _internal.autoDetectStaticPaths(f.routesDir, undefined, errors)
        expect(paths).toEqual(['/'])
        expect(errors).toEqual([])
      } finally {
        f.cleanup()
      }
    })

    it('expands an async getStaticPaths', async () => {
      const f = makeFixture({
        'posts/[id].tsx': 'export default () => null\nexport async function getStaticPaths() {}',
      })
      try {
        const registry = new Map<string, () => Promise<Array<{ params: Record<string, string> }>>>([
          ['/posts/:id', async () => [{ params: { id: 'x' } }]],
        ])
        const errors: { path: string; error: unknown }[] = []
        const paths = await _internal.autoDetectStaticPaths(f.routesDir, registry as any, errors)
        expect(paths).toContain('/posts/x')
        expect(errors).toEqual([])
      } finally {
        f.cleanup()
      }
    })

    it('captures errors when getStaticPaths throws', async () => {
      const f = makeFixture({
        'posts/[id].tsx': 'export default () => null\nexport function getStaticPaths() {}',
      })
      try {
        const registry = new Map<string, () => Array<{ params: Record<string, string> }>>([
          [
            '/posts/:id',
            () => {
              throw new Error('fetch failed')
            },
          ],
        ])
        const errors: { path: string; error: unknown }[] = []
        const paths = await _internal.autoDetectStaticPaths(f.routesDir, registry as any, errors)
        // Failing route is omitted, but the call doesn't crash.
        expect(paths).not.toContain('/posts/:id')
        expect(errors).toHaveLength(1)
        expect(errors[0]!.path).toBe('/posts/:id')
        expect((errors[0]!.error as Error).message).toBe('fetch failed')
      } finally {
        f.cleanup()
      }
    })

    it('captures errors when getStaticPaths returns a non-array', async () => {
      const f = makeFixture({
        'posts/[id].tsx': 'export default () => null\nexport function getStaticPaths() {}',
      })
      try {
        const registry = new Map<string, () => unknown>([['/posts/:id', () => ({}) as any]])
        const errors: { path: string; error: unknown }[] = []
        await _internal.autoDetectStaticPaths(f.routesDir, registry as any, errors)
        expect(errors).toHaveLength(1)
        expect((errors[0]!.error as Error).message).toMatch(/must return an array/)
      } finally {
        f.cleanup()
      }
    })

    it('captures errors when entry is missing params', async () => {
      const f = makeFixture({
        'posts/[id].tsx': 'export default () => null\nexport function getStaticPaths() {}',
      })
      try {
        const registry = new Map<string, () => Array<{ params: Record<string, string> }>>([
          // @ts-expect-error — deliberately malformed for the test
          ['/posts/:id', () => [{ wrong: 'shape' }]],
        ])
        const errors: { path: string; error: unknown }[] = []
        await _internal.autoDetectStaticPaths(f.routesDir, registry as any, errors)
        expect(errors).toHaveLength(1)
        expect((errors[0]!.error as Error).message).toMatch(/without "params"/)
      } finally {
        f.cleanup()
      }
    })

    it('handles a catch-all route via getStaticPaths', async () => {
      const f = makeFixture({
        'docs/[...slug].tsx': 'export default () => null\nexport function getStaticPaths() {}',
      })
      try {
        const registry = new Map<string, () => Array<{ params: Record<string, string> }>>([
          ['/docs/:slug*', () => [{ params: { slug: 'a/b' } }, { params: { slug: 'c' } }]],
        ])
        const errors: { path: string; error: unknown }[] = []
        const paths = await _internal.autoDetectStaticPaths(f.routesDir, registry as any, errors)
        expect(paths).toContain('/docs/a/b')
        expect(paths).toContain('/docs/c')
      } finally {
        f.cleanup()
      }
    })
  })

  describe('SSR entry source — getStaticPaths registry', () => {
    it('emits a __getStaticPathsRegistry collector that walks routes + children', () => {
      // The SSR sub-build exports a Map<urlPath, getStaticPaths>. The
      // collector must:
      // 1. Walk the top-level routes array
      // 2. Recurse into route.children (nested layouts)
      // 3. Skip routes without a getStaticPaths function
      // 4. Use the route's `path` as the map key
      expect(_internal.renderSsrEntrySource()).toContain('__getStaticPathsRegistry')
      expect(_internal.renderSsrEntrySource()).toContain('collectStaticPathsRegistry')
      expect(_internal.renderSsrEntrySource()).toContain('typeof r.getStaticPaths === "function"')
      expect(_internal.renderSsrEntrySource()).toContain('Array.isArray(r.children)')
    })
  })

  describe('output path resolution', () => {
    it('"/" → dist/index.html', () => {
      expect(_internal.resolveOutputPath('/dist', '/')).toBe('/dist/index.html')
    })

    it('"/about" → dist/about/index.html', () => {
      expect(_internal.resolveOutputPath('/dist', '/about')).toBe('/dist/about/index.html')
    })

    it('"/foo/bar" → dist/foo/bar/index.html', () => {
      expect(_internal.resolveOutputPath('/dist', '/foo/bar')).toBe('/dist/foo/bar/index.html')
    })

    it('explicit .html → dist/<path>', () => {
      expect(_internal.resolveOutputPath('/dist', '/sitemap.html')).toBe('/dist/sitemap.html')
    })
  })

  describe('404 emission — SSR entry source (PR C + K)', () => {
    // The entry source emits an exported `__notFoundComponentsByLocale`
    // Map (PR K) plus a back-compat `__notFoundComponent` (PR C) and an
    // async `__renderNotFound(locale?)`. The Map keys are locale strings
    // (or `null` for the default / no-i18n case); the closeBundle iterates
    // them to write `dist/404.html` + per-locale `dist/{locale}/404.html`.
    it('exports __notFoundComponentsByLocale Map walked from the routes tree', () => {
      // PR K: the new per-locale walker is the source of truth.
      expect(_internal.renderSsrEntrySource()).toContain(
        'export const __notFoundComponentsByLocale',
      )
      expect(_internal.renderSsrEntrySource()).toContain(
        'findNotFoundComponentsByLocale(routes, null)',
      )
    })

    it('keeps __notFoundComponent back-compat export for downstream consumers', () => {
      // Pre-PR-K SSR entries shipped just `__notFoundComponent`. Keep it
      // as a derived const reading from the Map (null-locale entry) so
      // downstream code that imports it directly keeps working.
      expect(_internal.renderSsrEntrySource()).toContain('export const __notFoundComponent')
    })

    it('walks recursively into route children', () => {
      // A `_404.tsx` under a nested layout (per-locale subtree) attaches
      // as `notFoundComponent` on the nested record. The walker must
      // descend into `r.children` AND track the ambient locale so the
      // per-locale 404 lands in the right Map entry.
      expect(_internal.renderSsrEntrySource()).toContain('Array.isArray(r.children)')
      expect(_internal.renderSsrEntrySource()).toContain('walk(r.children, locale)')
    })

    it('bakes the configured locales into the entry source as a JSON literal', () => {
      // PR K: per-locale 404 detection requires knowing the locales at
      // SSG entry module-eval time. The outer plugin passes
      // `config.i18n?.locales ?? []` as a `JSON.stringify`-d literal.
      expect(_internal.renderSsrEntrySource(['en', 'de', 'cs'])).toContain(
        'const __i18nLocales = ["en","de","cs"]',
      )
      // Empty list (no i18n configured) → empty array literal.
      expect(_internal.renderSsrEntrySource()).toContain('const __i18nLocales = []')
    })

    it('exports an async __renderNotFound that uses the same head pipeline', () => {
      expect(_internal.renderSsrEntrySource()).toContain(
        'export async function __renderNotFound(locale)',
      )
      // Reuses renderWithHead so styler tag + @pyreon/head meta land
      // on the rendered 404 page exactly like regular paths.
      expect(_internal.renderSsrEntrySource()).toContain('renderWithHead(vnode)')
    })

    it('returns null when the requested locale has no notFoundComponent', () => {
      // PR K: the per-locale renderer returns null when the Map has no
      // entry for the requested locale OR the entry isn't a function.
      // Closes the gate-not-error path for apps without `_404.tsx`.
      expect(_internal.renderSsrEntrySource()).toContain(
        'if (typeof component !== "function") return null',
      )
    })

    it('routes the 404 render through the SAME renderPath as regular pages (PR L5)', () => {
      // Pre-L5: __renderNotFound called h(NotFound, null) standalone — the
      // matched chain was empty, so parent layouts didn't wrap the
      // rendered 404. Post-L5: __renderNotFound navigates the router to
      // a synthetic non-matching probe URL per locale. resolveRoute's
      // notFoundComponent walker (in @pyreon/router) builds a chain
      // [...ancestorLayouts, syntheticLeaf] for the probe URL, and the
      // normal renderPath pipeline produces 404 HTML wrapped in layout
      // chrome.
      const source = _internal.renderSsrEntrySource()
      const renderNotFoundBlock = source.slice(
        source.indexOf('export async function __renderNotFound'),
      )
      // Probe URL is the marker the resolver looks for non-matching paths.
      expect(renderNotFoundBlock).toContain('__pyreon_not_found_probe__')
      // Calls renderPath (the regular-path SSG renderer in the same module).
      // PR C — passes `{ isNotFound: true }` so parent-layout loaders are
      // skipped during the 404 build.
      expect(renderNotFoundBlock).toContain('renderPath(probePath, { isNotFound: true })')
      // Standalone h(component, null) is preserved as a fallback for
      // tree shapes where no notFoundComponent is reachable from the
      // probe URL (rare — primarily back-compat for old SSR entries).
      expect(renderNotFoundBlock).toContain('renderWithHead(vnode)')
    })

    it('locale-aware probe URL prefix for per-locale 404 fallback (PR L5)', () => {
      // Per-locale 404 in i18n apps: the probe URL must carry the locale
      // prefix so resolveRoute matches the locale's layout subtree.
      // `/de/__pyreon_not_found_probe__` matches the `/de` layout's
      // notFoundComponent; `/__pyreon_not_found_probe__` matches the
      // root layout's.
      const source = _internal.renderSsrEntrySource()
      const renderNotFoundBlock = source.slice(
        source.indexOf('export async function __renderNotFound'),
      )
      expect(renderNotFoundBlock).toMatch(/locale == null[\s\S]*__pyreon_not_found_probe__/)
      // Per-locale path uses the locale variable.
      expect(renderNotFoundBlock).toContain('/${locale}/__pyreon_not_found_probe__')
    })
  })

  describe('injectIntoTemplate (PR C)', () => {
    // Factored out of the per-path render loop in PR C so the 404 path
    // can reuse the exact same injection rules. The previous shape
    // inlined the same regex/replace block in two places — risk of drift.
    const result = {
      appHtml: '<div>app</div>',
      head: '<title>X</title>',
      loaderScript: '<script>window.D=1</script>',
    }

    it('replaces Pyreon comment placeholders when present', () => {
      const tpl =
        '<html><head><!--pyreon-head--></head><body><!--pyreon-app--><!--pyreon-scripts--></body></html>'
      const html = _internal.injectIntoTemplate(tpl, result)
      expect(html).toContain('<title>X</title>')
      expect(html).toContain('<div>app</div>')
      expect(html).toContain('<script>window.D=1</script>')
      expect(html).not.toContain('<!--pyreon-head-->')
      expect(html).not.toContain('<!--pyreon-app-->')
      expect(html).not.toContain('<!--pyreon-scripts-->')
    })

    it('falls back to before-</head> for head when no placeholder', () => {
      const tpl = '<html><head></head><body><div id="app"></div></body></html>'
      const html = _internal.injectIntoTemplate(tpl, result)
      expect(html).toContain('<title>X</title></head>')
    })

    it('falls back to inside <div id="app"> for app when no placeholder', () => {
      const tpl = '<html><head></head><body><div id="app"></div></body></html>'
      const html = _internal.injectIntoTemplate(tpl, result)
      expect(html).toContain('<div id="app"><div>app</div></div>')
    })

    it('falls back to before-</body> for app when no #app and no placeholder', () => {
      const tpl = '<html><head></head><body></body></html>'
      // Head injects first. App has no #app + no placeholder → wraps appHtml
      // in <div id="app"> before </body>. Script then injects again before
      // </body>, so the FINAL </body> trails the script — but the app div
      // is structurally present and its contents preserved.
      const html = _internal.injectIntoTemplate(tpl, result)
      expect(html).toContain('<div id="app"><div>app</div></div>')
      expect(html.indexOf('<div id="app">')).toBeLessThan(html.indexOf('<script>window.D=1</script>'))
    })

    it('falls back to before-</body> for loader script when no placeholder', () => {
      const tpl = '<html><head></head><body><div id="app"></div></body></html>'
      const html = _internal.injectIntoTemplate(tpl, result)
      expect(html).toContain('<script>window.D=1</script></body>')
    })

    it('skips empty head/loaderScript without injecting blank content', () => {
      const tpl = '<html><head></head><body><div id="app"></div></body></html>'
      const html = _internal.injectIntoTemplate(tpl, {
        appHtml: '<div>app</div>',
        head: '',
        loaderScript: '',
      })
      // No empty replacement was injected before </head> or </body>
      expect(html).toContain('<head></head>')
      expect(html).toContain('</body>')
    })
  })

  describe('SSR entry source — redirect catch (PR B)', () => {
    // The SSG entry must catch redirects from `router.preload(path)`
    // BEFORE rendering. Rendering past a redirect produces HTML for
    // the wrong page AND leaks auth-gated layout structure for
    // unauthenticated users — same reason `@pyreon/server`'s SSR
    // handler short-circuits on redirect-throw.
    it('delegates redirect catching to renderPage (PR B semantics preserved)', () => {
      // Pre-unification the entry hand-rolled try/catch + getRedirectInfo
      // around router.preload. renderPage owns that now — the entry just
      // forwards skipLoaders (PR C) and maps the result kind. Rendering
      // past a redirect (wrong-page HTML + auth-layout leak) stays
      // impossible because renderPage catches BEFORE rendering.
      const src = _internal.renderSsrEntrySource()
      expect(src).toContain('renderPage(App, router, path')
      expect(src).toContain('skipLoaders:')
      expect(src).not.toContain('getRedirectInfo')
    })

    it('returns a redirect descriptor with kind="redirect" + from/to/status', () => {
      // The descriptor shape must match the closeBundle's discriminated
      // union — `kind: 'redirect'` distinguishes from the HTML branch.
      const src = _internal.renderSsrEntrySource()
      expect(src).toContain('kind: "redirect"')
      expect(src).toContain('from: path')
      expect(src).toContain('to: result.to')
      expect(src).toContain('status: result.status')
    })

    it('marks the success branch with kind="html"', () => {
      // The non-redirect branch must explicitly tag its return shape so
      // the closeBundle's switch on `result.kind` is exhaustive.
      expect(_internal.renderSsrEntrySource()).toContain('kind: "html"')
    })
  })

  describe('renderNetlifyRedirects (PR B)', () => {
    it('emits one line per redirect in `<from> <to> <status>` format', () => {
      const out = _internal.renderNetlifyRedirects([
        { from: '/old', to: '/new', status: 308 },
        { from: '/legacy', to: '/v2', status: 301 },
      ])
      expect(out).toContain('/old /new 308')
      expect(out).toContain('/legacy /v2 301')
    })

    it('includes a self-documenting comment header', () => {
      const out = _internal.renderNetlifyRedirects([{ from: '/a', to: '/b', status: 307 }])
      // Auto-generated marker so deploy logs / git diffs identify it.
      expect(out).toMatch(/^# Auto-generated by @pyreon\/zero/)
    })

    it('returns empty string for empty input (no file emitted)', () => {
      expect(_internal.renderNetlifyRedirects([])).toBe('')
    })

    it('terminates with a trailing newline', () => {
      const out = _internal.renderNetlifyRedirects([{ from: '/a', to: '/b', status: 308 }])
      expect(out.endsWith('\n')).toBe(true)
    })
  })

  describe('renderVercelRedirectsJson (PR B)', () => {
    it('emits JSON shape Vercel reads from vercel.json', () => {
      const out = _internal.renderVercelRedirectsJson([{ from: '/old', to: '/new', status: 308 }])
      const parsed = JSON.parse(out)
      expect(parsed.redirects).toEqual([
        { source: '/old', destination: '/new', permanent: true, statusCode: 308 },
      ])
    })

    it('marks 301/308 as permanent: true', () => {
      const out = _internal.renderVercelRedirectsJson([
        { from: '/a', to: '/b', status: 301 },
        { from: '/c', to: '/d', status: 308 },
      ])
      const parsed = JSON.parse(out)
      expect(parsed.redirects[0].permanent).toBe(true)
      expect(parsed.redirects[1].permanent).toBe(true)
    })

    it('marks 302/307 as permanent: false', () => {
      const out = _internal.renderVercelRedirectsJson([
        { from: '/a', to: '/b', status: 302 },
        { from: '/c', to: '/d', status: 307 },
      ])
      const parsed = JSON.parse(out)
      expect(parsed.redirects[0].permanent).toBe(false)
      expect(parsed.redirects[1].permanent).toBe(false)
    })

    it('preserves the original status in `statusCode`', () => {
      // The `permanent` boolean collapses 301/308 + 302/307 each into
      // the same flag — `statusCode` keeps the original so adapters
      // that distinguish 301 vs 308 (or 302 vs 307) can.
      const out = _internal.renderVercelRedirectsJson([{ from: '/a', to: '/b', status: 307 }])
      expect(JSON.parse(out).redirects[0].statusCode).toBe(307)
    })

    it('emits parseable JSON for empty input', () => {
      const parsed = JSON.parse(_internal.renderVercelRedirectsJson([]))
      expect(parsed.redirects).toEqual([])
    })
  })

  describe('renderMetaRefreshHtml (PR B)', () => {
    it('emits a meta-refresh + canonical link to the target', () => {
      const out = _internal.renderMetaRefreshHtml('/login')
      expect(out).toContain('<meta http-equiv="refresh" content="0; url=/login">')
      expect(out).toContain('<link rel="canonical" href="/login">')
    })

    it('escapes HTML special characters in the target URL', () => {
      // The target may include `&` (query strings), `<`, `>`, `"`, `'`
      // — all must be HTML-attribute escaped.
      const out = _internal.renderMetaRefreshHtml('/path?q=a&b=c<>')
      expect(out).toContain('q=a&amp;b=c&lt;&gt;')
      expect(out).not.toContain('q=a&b=c<>')
    })

    it('escapes single quote (XSS guard for unquoted-attr edge case)', () => {
      const out = _internal.renderMetaRefreshHtml(`/path'with-quote`)
      expect(out).toContain('&#39;')
    })

    it('includes a fallback link for users with refresh disabled', () => {
      // A11y / progressive-enhancement fallback — older browsers, NoScript,
      // or hosts that strip meta-refresh still get a clickable link.
      const out = _internal.renderMetaRefreshHtml('/target')
      expect(out).toContain('<a href="/target">/target</a>')
    })
  })

  describe('renderErrorArtifact (PR G)', () => {
    it('serialises Error instances with name + message + stack', () => {
      const err = new TypeError('boom')
      const out = _internal.renderErrorArtifact([{ path: '/posts/1', error: err }])
      const parsed = JSON.parse(out) as {
        errors: Array<{ path: string; message: string; name: string; stack?: string }>
      }
      expect(parsed.errors).toHaveLength(1)
      expect(parsed.errors[0]?.path).toBe('/posts/1')
      expect(parsed.errors[0]?.message).toBe('boom')
      expect(parsed.errors[0]?.name).toBe('TypeError')
      expect(typeof parsed.errors[0]?.stack).toBe('string')
    })

    it('serialises non-Error throws (string / number / object) via String()', () => {
      const out = _internal.renderErrorArtifact([
        { path: '/a', error: 'plain string' },
        { path: '/b', error: 42 },
        { path: '/c', error: { custom: 'shape' } },
      ])
      const parsed = JSON.parse(out) as {
        errors: Array<{ path: string; message: string; name: string }>
      }
      expect(parsed.errors[0]?.message).toBe('plain string')
      expect(parsed.errors[0]?.name).toBe('Error')
      expect(parsed.errors[0]?.stack).toBeUndefined()
      expect(parsed.errors[1]?.message).toBe('42')
      // Object → '[object Object]' via String() — acceptable; thrown
      // non-Error objects are an anti-pattern, just don't crash here.
      expect(parsed.errors[2]?.message).toBe('[object Object]')
    })

    it('wraps entries in { errors: [...] } object (forward-compatible)', () => {
      // Bare-array shape would lock us out of adding fields like
      // `buildId` / `timing` / `version` in a future PR. Object-wrapped
      // shape lets consumers `JSON.parse(file).errors` safely.
      const out = _internal.renderErrorArtifact([])
      const parsed = JSON.parse(out) as Record<string, unknown>
      expect(parsed).toHaveProperty('errors')
      expect(Array.isArray(parsed.errors)).toBe(true)
    })

    it('emits trailing newline (POSIX text-file convention)', () => {
      const out = _internal.renderErrorArtifact([
        { path: '/x', error: new Error('y') },
      ])
      expect(out.endsWith('\n')).toBe(true)
    })

    it('preserves entry order (path 1 → path 2 → path 3)', () => {
      // Order matters for users diffing the artifact across builds —
      // entry order should match the render-loop traversal order.
      const out = _internal.renderErrorArtifact([
        { path: '/a', error: new Error('1') },
        { path: '/b', error: new Error('2') },
        { path: '/c', error: new Error('3') },
      ])
      const parsed = JSON.parse(out) as { errors: Array<{ path: string }> }
      expect(parsed.errors.map((e) => e.path)).toEqual(['/a', '/b', '/c'])
    })

    it('handles the synthetic "(onPathError)" path suffix from callback throws', () => {
      // The render loop appends "(onPathError)" to the path when the
      // user callback itself throws. The artifact serialiser doesn't
      // need special handling — the suffix is just part of the path
      // string — but lock this in so downstream parsers don't get
      // surprised by a suffix that wasn't documented.
      const out = _internal.renderErrorArtifact([
        { path: '/posts/bad (onPathError)', error: new Error('callback boom') },
      ])
      const parsed = JSON.parse(out) as { errors: Array<{ path: string }> }
      expect(parsed.errors[0]?.path).toBe('/posts/bad (onPathError)')
    })
  })

  describe('detectPathCollisions (M1.4)', () => {
    // Bisect-load-bearing: a static route + getStaticPaths overlap, or
    // two enumerators producing the same URL, would silently last-wins
    // pre-fix. The render loop's `writtenPaths.push(p)` accepts dupes
    // and the second HTML overwrites the first with zero signal. The
    // pre-render check surfaces the collision with the duplicate URL
    // listed so users fix the source conflict.

    it('returns empty array when paths are unique', () => {
      expect(_internal.detectPathCollisions(['/', '/about', '/posts/1'])).toEqual([])
    })

    it('returns duplicates sorted + de-duplicated', () => {
      const result = _internal.detectPathCollisions([
        '/about',
        '/posts/1',
        '/about',
        '/posts/1',
        '/about',
      ])
      // Each duplicate URL listed ONCE (set-based dedup), sorted alphabetically.
      expect(result).toEqual(['/about', '/posts/1'])
    })

    it('handles the canonical collision shape: static + getStaticPaths overlap', () => {
      // Real-app shape: `routes/posts/foo.tsx` (static) +
      // `routes/posts/[id].tsx` with `getStaticPaths: [{id:'foo'}]` →
      // BOTH produce `/posts/foo` in the resolved paths array.
      const paths = ['/', '/posts/foo', '/posts/bar', '/posts/foo']
      expect(_internal.detectPathCollisions(paths)).toEqual(['/posts/foo'])
    })

    it('error message names every duplicate path with actionable guidance', () => {
      const msg = _internal.formatPathCollisionError(['/posts/foo', '/about'])
      expect(msg).toContain('[Pyreon]')
      expect(msg).toContain('SSG path collision')
      expect(msg).toContain('2 URL(s)')
      expect(msg).toContain('/posts/foo')
      expect(msg).toContain('/about')
      // Actionable: tells user where to look.
      expect(msg).toMatch(/getStaticPaths/)
      expect(msg).toMatch(/routes tree/)
    })

    it('empty input returns empty (no false-positive on empty paths)', () => {
      expect(_internal.detectPathCollisions([])).toEqual([])
    })

    it('single-element input returns empty', () => {
      expect(_internal.detectPathCollisions(['/'])).toEqual([])
    })

    // ─── Wiring integration ──────────────────────────────────────────────────
    //
    // The helpers above prove the detector + formatter work in isolation. The
    // following specs prove the CLOSEBUNDLE WIRING calls through them. The
    // closeBundle handler at `ssg-plugin.ts:closeBundle` runs
    // `assertNoPathCollisions(paths)` between `resolvePaths` and the render
    // loop. Removing that single call → the build silently last-wins on dupes
    // (one HTML overwrites the other with zero signal).
    //
    // Bisect-load-bearing: replace `assertNoPathCollisions(paths)` in
    // closeBundle with `void paths` → these specs would still pass (they call
    // the helper directly). The real CI guard for the call-site comes from
    // `verify-modes` + the audit-types check. The unit specs here lock the
    // CONTRACT of `assertNoPathCollisions` itself.

    it('assertNoPathCollisions throws on duplicates (wiring contract)', () => {
      expect(() =>
        _internal.assertNoPathCollisions(['/about', '/posts/1', '/about', '/posts/1']),
      ).toThrow(/\[Pyreon\] SSG path collision/)
      expect(() =>
        _internal.assertNoPathCollisions(['/about', '/posts/1', '/about', '/posts/1']),
      ).toThrow(/2 URL\(s\)/)
      expect(() => _internal.assertNoPathCollisions(['/about', '/about'])).toThrow(/\/about/)
    })

    it('assertNoPathCollisions is a no-op on unique paths', () => {
      expect(() => _internal.assertNoPathCollisions(['/', '/about', '/posts/1'])).not.toThrow()
      expect(() => _internal.assertNoPathCollisions([])).not.toThrow()
      expect(() => _internal.assertNoPathCollisions(['/'])).not.toThrow()
    })

    it('resolvePaths forwards explicit-array dupes verbatim (wiring step 1)', async () => {
      // `config.ssg.paths` accepts a user-supplied array. When it contains
      // dupes (operator error: same path listed twice), `resolvePaths`
      // returns them as-is — `assertNoPathCollisions` is what catches it.
      const result = await _internal.resolvePaths(
        { ssg: { paths: ['/about', '/posts/1', '/about', '/posts/1'] } },
        '/dev/null',
      )
      expect(result).toEqual(['/about', '/posts/1', '/about', '/posts/1'])
      // Closing the wiring: feed the result through the gate.
      expect(() => _internal.assertNoPathCollisions(result)).toThrow(
        /SSG path collision/,
      )
    })

    it('resolvePaths forwards async-function dupes verbatim (wiring step 1, async)', async () => {
      // `config.ssg.paths` also accepts `() => Promise<string[]>`. Same
      // wiring contract — dupes returned by the user's enumerator surface
      // at `assertNoPathCollisions`.
      const result = await _internal.resolvePaths(
        { ssg: { paths: async () => ['/blog/foo', '/blog/foo'] } },
        '/dev/null',
      )
      expect(result).toEqual(['/blog/foo', '/blog/foo'])
      expect(() => _internal.assertNoPathCollisions(result)).toThrow(/\/blog\/foo/)
    })
  })

  describe('runWithConcurrency (PR D)', () => {
    it('processes every item exactly once', async () => {
      const items = ['a', 'b', 'c', 'd', 'e']
      const seen: string[] = []
      await _internal.runWithConcurrency(items, 2, async (item) => {
        seen.push(item)
      })
      expect(seen.sort()).toEqual([...items].sort())
      expect(seen).toHaveLength(items.length)
    })

    it('respects the concurrency cap — never more than N in flight', async () => {
      // Track in-flight count by incrementing on entry + decrementing on exit.
      // The peak is the maximum that should match the concurrency cap.
      const items = Array.from({ length: 20 }, (_, i) => i)
      let inFlight = 0
      let peak = 0
      const release: Array<() => void> = []
      const gate: Array<Promise<void>> = []
      for (let i = 0; i < items.length; i++) {
        gate.push(new Promise((r) => release.push(r)))
      }
      const runPromise = _internal.runWithConcurrency(items, 4, async (i) => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await gate[i]
        inFlight--
      })
      // Release one at a time so the peak measurement is meaningful.
      for (const r of release) {
        await new Promise((resolve) => setTimeout(resolve, 1))
        r()
      }
      await runPromise
      expect(peak).toBe(4)
      expect(inFlight).toBe(0)
    })

    it('concurrency=1 renders fully sequentially (no overlap)', async () => {
      const items = [1, 2, 3, 4, 5]
      let inFlight = 0
      let peak = 0
      await _internal.runWithConcurrency(items, 1, async () => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 1))
        inFlight--
      })
      expect(peak).toBe(1)
    })

    it('clamps concurrency=0 to 1 (never silently hangs)', async () => {
      const items = [1, 2, 3]
      const seen: number[] = []
      await _internal.runWithConcurrency(items, 0, async (i) => {
        seen.push(i)
      })
      expect(seen).toHaveLength(3)
    })

    it('concurrency higher than items.length spawns at most items.length workers', async () => {
      // Empirically: with 2 items and concurrency 100, we should spawn 2
      // workers, not 100. Otherwise idle workers hold microtasks on a
      // Promise.all hub-and-spoke and slow tear-down.
      const items = ['x', 'y']
      let started = 0
      await _internal.runWithConcurrency(items, 100, async () => {
        started++
      })
      // Both items processed, no extras.
      expect(started).toBe(2)
    })

    it('empty items returns immediately (no workers spawned)', async () => {
      let started = 0
      await _internal.runWithConcurrency([], 4, async () => {
        started++
      })
      expect(started).toBe(0)
    })

    it('onSettled fires once per item, in path-SETTLE order', async () => {
      // Items 'slow', 'fast' — slow has longer wait. With concurrency 2,
      // both start in parallel; fast settles first, then slow. onSettled
      // sequence should be ['fast', 'slow'].
      const items = ['slow', 'fast']
      const settled: string[] = []
      await _internal.runWithConcurrency(
        items,
        2,
        async (item) => {
          await new Promise((resolve) => setTimeout(resolve, item === 'slow' ? 20 : 1))
        },
        async (item) => {
          settled.push(item)
        },
      )
      expect(settled).toEqual(['fast', 'slow'])
    })

    it('onSettled receives correct idx (input position, not settle order)', async () => {
      const items = ['slow', 'fast']
      const settled: Array<{ item: string; idx: number }> = []
      await _internal.runWithConcurrency(
        items,
        2,
        async (item) => {
          await new Promise((resolve) => setTimeout(resolve, item === 'slow' ? 20 : 1))
        },
        async (item, idx) => {
          settled.push({ item, idx })
        },
      )
      // 'fast' settles first but its idx is 1 (input position).
      expect(settled[0]).toEqual({ item: 'fast', idx: 1 })
      expect(settled[1]).toEqual({ item: 'slow', idx: 0 })
    })

    it('errors thrown by processItem propagate (no swallowing)', async () => {
      // Caller is responsible for catching exceptions. The pool doesn't
      // mask them — they fail the overall await Promise.all.
      const items = [1, 2, 3]
      await expect(
        _internal.runWithConcurrency(items, 2, async (i) => {
          if (i === 2) throw new Error('boom')
        }),
      ).rejects.toThrow('boom')
    })

    it('async onSettled is awaited before its worker pulls the next item', async () => {
      // Per-worker serialization: a worker can't claim its NEXT item
      // until its previous onSettled has resolved. This keeps progress
      // counters monotonic from any single worker's perspective.
      // Cross-worker serialization is NOT guaranteed (documented).
      const items = [1, 2, 3, 4]
      const trace: string[] = []
      // Concurrency 1 → strict per-item serialization (process N → settle N → process N+1).
      await _internal.runWithConcurrency(
        items,
        1,
        async (i) => {
          trace.push(`process-${i}`)
        },
        async (i) => {
          await new Promise((resolve) => setTimeout(resolve, 5))
          trace.push(`settle-${i}`)
        },
      )
      expect(trace).toEqual([
        'process-1',
        'settle-1',
        'process-2',
        'settle-2',
        'process-3',
        'settle-3',
        'process-4',
        'settle-4',
      ])
    })
  })

  describe('writeFileAtomic (M2.1)', () => {
    // Bisect-load-bearing: revert `writeFileAtomic` to a bare `writeFile`
    // call → the tmp-file-cleanup-on-error spec fails (no rename =
    // partial state).

    it('writes the target file with the given content', async () => {
      const { mkdtempSync, rmSync, readFileSync } = await import('node:fs')
      const { join: pathJoin } = await import('node:path')
      const { tmpdir } = await import('node:os')
      const dir = mkdtempSync(pathJoin(tmpdir(), 'pyreon-atomic-'))
      try {
        const target = pathJoin(dir, '_redirects')
        await _internal.writeFileAtomic(target, '/old /new 301\n')
        expect(readFileSync(target, 'utf8')).toBe('/old /new 301\n')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })

    it('rejects (and leaves tmp behavior to the cleanup branch) when target dir does not exist', async () => {
      // Construct a target path whose parent dir doesn't exist — both the
      // writeFile and rename will fail. Asserts the helper rejects rather
      // than swallowing. The cleanup-on-error branch is best-effort and
      // unit-untestable cross-platform (Linux/macOS/Windows differ on what
      // failure modes leave behind), so we don't assert tmp absence here.
      const { mkdtempSync, rmSync } = await import('node:fs')
      const { join: pathJoin } = await import('node:path')
      const { tmpdir } = await import('node:os')
      const dir = mkdtempSync(pathJoin(tmpdir(), 'pyreon-atomic-'))
      try {
        const target = pathJoin(dir, 'nonexistent-subdir', 'file')
        await expect(_internal.writeFileAtomic(target, 'x')).rejects.toThrow()
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })

    it('overwrites an existing file atomically', async () => {
      const { mkdtempSync, rmSync, readFileSync, writeFileSync } = await import('node:fs')
      const { join: pathJoin } = await import('node:path')
      const { tmpdir } = await import('node:os')
      const dir = mkdtempSync(pathJoin(tmpdir(), 'pyreon-atomic-'))
      try {
        const target = pathJoin(dir, 'data.json')
        writeFileSync(target, '{"old": true}\n')
        await _internal.writeFileAtomic(target, '{"new": true}\n')
        expect(readFileSync(target, 'utf8')).toBe('{"new": true}\n')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  })

  describe('buildLocaleSummary (M2.5)', () => {
    // Bisect-load-bearing: change the prefix-except-default branch to skip
    // unprefixed-path counting → the default-locale spec fails (count = 0).

    it('returns empty string for empty writtenPaths', () => {
      expect(
        _internal.buildLocaleSummary([], {
          locales: ['en', 'de'],
          defaultLocale: 'en',
        }),
      ).toBe('')
    })

    it('counts per-locale under prefix-except-default (unprefixed = default locale)', () => {
      const result = _internal.buildLocaleSummary(
        ['/', '/about', '/de/about', '/de/posts/1', '/cs/about'],
        {
          locales: ['en', 'de', 'cs'],
          defaultLocale: 'en',
          strategy: 'prefix-except-default',
        },
      )
      // en: 2 unprefixed (/ and /about); de: 2 prefixed; cs: 1 prefixed
      expect(result).toBe(' [en: 2, de: 2, cs: 1]')
    })

    it('counts per-locale under prefix (every locale prefixed including default)', () => {
      const result = _internal.buildLocaleSummary(
        ['/en/', '/en/about', '/de/about', '/cs/about'],
        {
          locales: ['en', 'de', 'cs'],
          defaultLocale: 'en',
          strategy: 'prefix',
        },
      )
      expect(result).toBe(' [en: 2, de: 1, cs: 1]')
    })

    it('skips unprefixed paths under prefix strategy (defensive — they\'re unexpected)', () => {
      const result = _internal.buildLocaleSummary(
        ['/about', '/en/about', '/de/about'],
        {
          locales: ['en', 'de'],
          defaultLocale: 'en',
          strategy: 'prefix',
        },
      )
      // Unprefixed `/about` not counted under prefix strategy.
      expect(result).toBe(' [en: 1, de: 1]')
    })

    it('returns empty string when locales is empty', () => {
      expect(
        _internal.buildLocaleSummary(['/about'], {
          locales: [],
          defaultLocale: '',
        }),
      ).toBe('')
    })
  })

  describe('closeBundle is no-op when mode != "ssg"', () => {
    // The plugin returns from closeBundle without side effects when SSG
    // is not configured. We can't easily run the real closeBundle in unit
    // tests (it triggers a Vite SSR build), but we can verify the early
    // return path doesn't throw when called against a non-SSG config.
    it('closeBundle returns silently for SPA mode', async () => {
      const plugin = ssgPlugin({ mode: 'spa' }) as any
      // configResolved must be called first to set distDir.
      plugin.configResolved({ root: '/tmp', build: { outDir: 'dist' } })
      // Should not throw and should not attempt any SSR build
      await expect(plugin.closeBundle()).resolves.toBeUndefined()
    })

    it('closeBundle returns silently for SSR mode', async () => {
      const plugin = ssgPlugin({ mode: 'ssr' }) as any
      plugin.configResolved({ root: '/tmp', build: { outDir: 'dist' } })
      await expect(plugin.closeBundle()).resolves.toBeUndefined()
    })
  })

  // A SERVER-target build (`build.ssr` set) has no client index.html to
  // prerender against — the post-step must SILENTLY no-op there (a
  // user-invoked `vite build --ssr <entry>` against a mode:'ssg' config
  // would otherwise either warn a misleading "Skipping SSG —
  // …/index.html not found" for its own outDir, or — worse, when a
  // stale dist/index.html from a previous client build exists — run
  // the whole prerender pipeline against the server build's outDir).
  // Mirrors the ssr-plugin's server-target guard.
  describe('closeBundle skips a server-target build (build.ssr set) silently', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('mode "ssg" + build.ssr → silent no-op (no misleading warning)', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const plugin = ssgPlugin({ mode: 'ssg' }) as any
      plugin.configResolved({
        root: '/tmp/pyreon-nonexistent-root',
        build: { outDir: 'dist/server', ssr: 'src/entry-server.ts' },
      })
      await expect(plugin.closeBundle()).resolves.toBeUndefined()
      expect(warn).not.toHaveBeenCalled()
    })

    it('DOES reach the index.html probe (and warns) for a client build', async () => {
      // Discriminating control: with build.ssr falsy, the same missing
      // root reaches the probe and warns — proving the silent skip
      // above comes from the guard, not from an earlier bail.
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const plugin = ssgPlugin({ mode: 'ssg' }) as any
      plugin.configResolved({
        root: '/tmp/pyreon-nonexistent-root',
        build: { outDir: 'dist', ssr: false },
      })
      await plugin.closeBundle()
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Skipping SSG'))
    })
  })

  // A leaked inner-build env flag (exported by a parent process / CI
  // shell, not set by a `buildSsrBundle` running in this process)
  // silently disables the ENTIRE prerender of a top-level mode:'ssg'
  // build. Still skip (safe), but say so. Genuine in-process sub-builds
  // stay silent. Mirrors the ssr-plugin's notice.
  describe('leaked inner-build env flag prints a one-line notice', () => {
    const RESOLVED = {
      root: '/tmp/pyreon-nonexistent-root',
      build: { outDir: 'dist' },
    }
    afterEach(() => {
      delete process.env[SSG_BUILD_FLAG]
      delete process.env[SSR_BUILD_FLAG]
      vi.restoreAllMocks()
    })

    it('warns for a leaked SSG flag on a top-level ssg build', async () => {
      process.env[SSG_BUILD_FLAG] = '1'
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const plugin = ssgPlugin({ mode: 'ssg' }) as any
      plugin.configResolved(RESOLVED)
      await plugin.closeBundle()
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('leaked in from the environment'),
      )
    })

    it('warns for a leaked SSR flag on a top-level ssg build', async () => {
      const plugin = ssgPlugin({ mode: 'ssg' }) as any
      plugin.configResolved(RESOLVED)
      // Set AFTER construction — the SSR flag is checked at closeBundle
      // time (it gates the ssr-plugin's inner build re-entering us).
      process.env[SSR_BUILD_FLAG] = '1'
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      await plugin.closeBundle()
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('leaked in from the environment'),
      )
    })

    it('stays SILENT for a genuine in-process inner sub-build', async () => {
      process.env[SSG_BUILD_FLAG] = '1'
      _enterInnerBuild()
      try {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const plugin = ssgPlugin({ mode: 'ssg' }) as any
        plugin.configResolved(RESOLVED)
        await plugin.closeBundle()
        expect(warn).not.toHaveBeenCalled()
      } finally {
        _exitInnerBuild()
      }
    })

    it('stays SILENT for non-ssg modes (hybrid skip is speculative, not a loss)', async () => {
      process.env[SSG_BUILD_FLAG] = '1'
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const plugin = ssgPlugin({ mode: 'ssr' }) as any
      plugin.configResolved(RESOLVED)
      await plugin.closeBundle()
      expect(warn).not.toHaveBeenCalled()
    })
  })

  // PR I — build-time ISR. The manifest emission step in `closeBundle`
  // delegates the real work to `buildRevalidateManifest(fileRoutes,
  // writtenPaths)` — testing that helper directly is the cleanest unit
  // surface (no synthetic SSR build, no real route files). The
  // closeBundle path is gated by the `verify-modes ssr-showcase ×
  // ssg-isr` cell which builds the real ssr-showcase app + asserts
  // `dist/_pyreon-revalidate.json`.
  describe('buildRevalidateManifest (PR I)', () => {
    type StubRoute = {
      urlPath: string
      isLayout: boolean
      isError: boolean
      isLoading: boolean
      isNotFound: boolean
      exports?: { revalidateLiteral?: string }
    }
    const route = (
      urlPath: string,
      revalidateLiteral?: string,
      flags: Partial<Pick<StubRoute, 'isLayout' | 'isError' | 'isLoading' | 'isNotFound'>> = {},
    ): StubRoute => ({
      urlPath,
      isLayout: flags.isLayout ?? false,
      isError: flags.isError ?? false,
      isLoading: flags.isLoading ?? false,
      isNotFound: flags.isNotFound ?? false,
      ...(revalidateLiteral !== undefined ? { exports: { revalidateLiteral } } : {}),
    })

    it('returns empty object when no routes have a revalidate literal', () => {
      const result = _internal.buildRevalidateManifest([route('/about'), route('/posts')], [
        '/about',
        '/posts',
      ])
      expect(result).toEqual({})
    })

    it('static route — `/about` with `revalidate = 60` maps to manifest', () => {
      const result = _internal.buildRevalidateManifest([route('/about', '60')], ['/about'])
      expect(result).toEqual({ '/about': 60 })
    })

    it('parses `false` literal as the false boolean (never revalidate)', () => {
      const result = _internal.buildRevalidateManifest([route('/legal', 'false')], ['/legal'])
      expect(result).toEqual({ '/legal': false })
    })

    it('dynamic route — `/posts/:id` with revalidate=60 covers ALL enumerated children', () => {
      // Real-app shape: posts/[id].tsx with `export const revalidate = 60`
      // and `getStaticPaths` enumerating 3 IDs. The SSG plugin emits
      // 3 concrete paths to writtenPaths; the manifest must map
      // EACH concrete path to 60 (the source-pattern's revalidate
      // value applies uniformly to its children — same shape that
      // motivated PR H's i18n cross-product).
      const result = _internal.buildRevalidateManifest(
        [route('/posts/:id', '60')],
        ['/posts/1', '/posts/2', '/posts/3'],
      )
      expect(result).toEqual({
        '/posts/1': 60,
        '/posts/2': 60,
        '/posts/3': 60,
      })
    })

    it('catch-all route — `/blog/:slug*` matches multi-segment paths', () => {
      const result = _internal.buildRevalidateManifest(
        [route('/blog/:slug*', '3600')],
        ['/blog/welcome', '/blog/2025/why-signals'],
      )
      expect(result).toEqual({
        '/blog/welcome': 3600,
        '/blog/2025/why-signals': 3600,
      })
    })

    it('skips layouts / errors / loading / notFound routes (they never appear in writtenPaths anyway)', () => {
      // Defense-in-depth — the SSG render loop already skips these
      // route kinds, so they shouldn't reach writtenPaths. The
      // helper's explicit guard is the regression catcher if a
      // future change removes the loop-side skip.
      const result = _internal.buildRevalidateManifest(
        [
          route('/_layout', '60', { isLayout: true }),
          route('/_error', '60', { isError: true }),
          route('/_loading', '60', { isLoading: true }),
          route('/_404', '60', { isNotFound: true }),
          route('/about', '60'),
        ],
        ['/_layout', '/_error', '/_loading', '/_404', '/about'],
      )
      // Only `/about` survives — the others are layout/error/loading/
      // notfound and skipped by the helper's `isLayout || isError ||
      // isLoading || isNotFound` continue.
      expect(result).toEqual({ '/about': 60 })
    })

    it('skips routes without a revalidate literal even if writtenPaths includes them', () => {
      const result = _internal.buildRevalidateManifest(
        [route('/about'), route('/posts/:id', '60')],
        ['/about', '/posts/1'],
      )
      // /about has no revalidate → omitted; /posts/1 gets 60.
      expect(result).toEqual({ '/posts/1': 60 })
    })

    it('skips concrete paths that are NOT in writtenPaths (errored or redirected pages)', () => {
      // If a route declared `revalidate = 60` but the path errored
      // out / redirected during render, it never lands in
      // writtenPaths — the manifest must NOT include it. Adapters
      // can't revalidate a page that was never prerendered.
      const result = _internal.buildRevalidateManifest(
        [route('/posts/:id', '60')],
        ['/posts/1'], // /posts/2 errored, not in writtenPaths
      )
      expect(result).toEqual({ '/posts/1': 60 })
      expect(result['/posts/2']).toBeUndefined()
    })

    it('drops routes whose revalidateLiteral is malformed JSON', () => {
      // Defensive: detectRouteExports's isPureLiteral check should
      // already filter, but the helper's JSON.parse + type guards
      // are the second line of defense.
      const result = _internal.buildRevalidateManifest(
        [route('/about', 'not-a-number'), route('/posts', '60')],
        ['/about', '/posts'],
      )
      expect(result).toEqual({ '/posts': 60 })
    })

    it('drops `true` (only `false` is the never-revalidate sentinel)', () => {
      const result = _internal.buildRevalidateManifest([route('/about', 'true')], ['/about'])
      expect(result).toEqual({})
    })

    // ─── PR-S11: specificity-aware route resolution ──────────────────────
    //
    // Pre-fix the routes-outer × paths-inner loop used `manifest[path] =
    // value` overwriting on every match. If two routes matched the same
    // concrete path (a static AND a catch-all), whichever route iterated
    // LAST won — silently wrong because the static route is structurally
    // more specific.

    it('PR-S11: static route wins over catch-all for an overlapping concrete path', () => {
      // /blog/special/static is matched by BOTH /blog/special/static
      // (a static route with NO revalidate) AND /blog/:slug* (a
      // catch-all with revalidate=3600). The static route's MORE
      // SPECIFIC pattern should claim the path. Since the static route
      // has no revalidate, the path should NOT appear in the manifest.
      const result = _internal.buildRevalidateManifest(
        [
          route('/blog/special/static'), // no revalidate, most specific
          route('/blog/:slug*', '3600'), // catch-all with revalidate
        ],
        ['/blog/special/static', '/blog/some-other-post'],
      )
      // /blog/special/static is NOT in the manifest — its more-specific
      // static route owns it, and that route has no revalidate.
      // /blog/some-other-post is matched ONLY by the catch-all.
      expect(result).toEqual({ '/blog/some-other-post': 3600 })
    })

    it('PR-S11: static route with revalidate wins over catch-all with different revalidate', () => {
      // /blog/featured (static, revalidate=60) overlaps with /blog/:slug*
      // (catch-all, revalidate=3600). The more-specific static route's
      // value wins.
      const result = _internal.buildRevalidateManifest(
        [
          route('/blog/featured', '60'), // static, more specific
          route('/blog/:slug*', '3600'), // catch-all, less specific
        ],
        ['/blog/featured', '/blog/other-post'],
      )
      expect(result).toEqual({
        '/blog/featured': 60, // static's revalidate wins (not 3600)
        '/blog/other-post': 3600, // catch-all owns
      })
    })

    it('PR-S11: dynamic param route beats catch-all on equal segment count', () => {
      // /posts/:id (1 dynamic segment after /posts) vs /posts/:slug*
      // (catch-all). The more-specific dynamic-param route should claim
      // single-segment paths. (Both have same number of static segments,
      // but `:id` is single-segment while `:slug*` is wildcard.)
      //
      // Note: under the current spec implementation, BOTH routes have
      // the same `specificity` (1 static segment: "posts") and same
      // `totalSegments` (2). The tiebreaker would go to whichever was
      // inserted first. The test documents the current behavior + serves
      // as a regression catcher if a stricter dynamic-vs-catch-all
      // heuristic is added later.
      const result = _internal.buildRevalidateManifest(
        [
          route('/posts/:id', '60'),
          route('/posts/:slug*', '3600'),
        ],
        ['/posts/123'],
      )
      // Under the current specificity heuristic both match; either
      // value is acceptable as long as the path appears EXACTLY ONCE.
      expect(Object.keys(result).length).toBe(1)
      expect(result['/posts/123']).toBeDefined()
      // The dynamic-param `/posts/:id` is preferred (inserted first
      // wins on tie, and a more general improvement would prefer it
      // anyway since `:id` is single-segment).
      expect(result['/posts/123']).toBe(60)
    })

    it('PR-S11: declaration order does NOT change result for non-overlapping paths', () => {
      // Sanity: reversing the route order should not change the manifest
      // for paths that only match ONE route. The bug class was
      // order-dependent ONLY when there was overlap.
      const a = _internal.buildRevalidateManifest(
        [route('/about', '60'), route('/contact', '120')],
        ['/about', '/contact'],
      )
      const b = _internal.buildRevalidateManifest(
        [route('/contact', '120'), route('/about', '60')],
        ['/about', '/contact'],
      )
      expect(a).toEqual(b)
      expect(a).toEqual({ '/about': 60, '/contact': 120 })
    })
  })

  // ─── PR-S13: mkdirOnce cache reset contract ─────────────────────────────
  //
  // The cache holds resolved-mkdir Promises keyed by absolute path. Reusing
  // entries across builds is unsafe when `dist/` has been wiped between
  // builds (vite build --watch, CI pipelines). The closeBundle handler
  // resets the cache at START (line ~1007) AND in a FINALLY block (line
  // ~1630, PR-S13) — defense-in-depth so a crash mid-render-loop leaves
  // a clean state for the next build.
  //
  // The finally wiring itself is integration-level (requires a full SSG
  // round-trip to exercise the crash path); these unit tests cover the
  // cache primitive's contract that the finally wiring relies on.

  describe('mkdirOnce cache (PR-S13)', () => {
    const { mkdtempSync, rmSync } = require('node:fs')
    const { tmpdir } = require('node:os')
    const path = require('node:path')

    it('deduplicates mkdir per directory string (cache size grows once per unique path)', async () => {
      const root = mkdtempSync(path.join(tmpdir(), 'pyreon-mkdir-cache-'))
      try {
        const dir = path.join(root, 'a/b/c')
        _internal._resetMkdirCache()
        expect(_internal._peekMkdirCacheSize()).toBe(0)

        await _internal.mkdirOnce(dir)
        expect(_internal._peekMkdirCacheSize()).toBe(1)

        // Second call hits the cache — size stays at 1.
        // (mkdirOnce is async so each call returns a fresh outer Promise
        // wrapping the cached inner Promise; we assert via cache size,
        // not Promise identity.)
        await _internal.mkdirOnce(dir)
        expect(_internal._peekMkdirCacheSize()).toBe(1)

        // Different directory creates a new entry.
        const otherDir = path.join(root, 'x/y/z')
        await _internal.mkdirOnce(otherDir)
        expect(_internal._peekMkdirCacheSize()).toBe(2)
      } finally {
        _internal._resetMkdirCache()
        rmSync(root, { recursive: true, force: true })
      }
    })

    it('_resetMkdirCache() clears every entry', async () => {
      const root = mkdtempSync(path.join(tmpdir(), 'pyreon-mkdir-reset-'))
      try {
        _internal._resetMkdirCache()
        await _internal.mkdirOnce(path.join(root, 'a'))
        await _internal.mkdirOnce(path.join(root, 'b'))
        await _internal.mkdirOnce(path.join(root, 'c'))
        expect(_internal._peekMkdirCacheSize()).toBe(3)

        _internal._resetMkdirCache()
        expect(_internal._peekMkdirCacheSize()).toBe(0)
      } finally {
        _internal._resetMkdirCache()
        rmSync(root, { recursive: true, force: true })
      }
    })

    it('repopulates after reset (cache count returns to expected after each cycle)', async () => {
      const root = mkdtempSync(path.join(tmpdir(), 'pyreon-mkdir-repopulate-'))
      try {
        const dir = path.join(root, 'a/b')
        _internal._resetMkdirCache()

        // First build: populate
        await _internal.mkdirOnce(dir)
        expect(_internal._peekMkdirCacheSize()).toBe(1)

        // Reset clears the cache
        _internal._resetMkdirCache()
        expect(_internal._peekMkdirCacheSize()).toBe(0)

        // Second build (post-reset): cache is empty + repopulates fresh.
        // This is the contract the closeBundle finally-block reset
        // preserves: even if a build crashed mid-render, the next
        // build starts with an empty cache and rebuilds it from
        // scratch (no stale Promise pointing at a wiped dist/).
        await _internal.mkdirOnce(dir)
        expect(_internal._peekMkdirCacheSize()).toBe(1)
      } finally {
        _internal._resetMkdirCache()
        rmSync(root, { recursive: true, force: true })
      }
    })

    it('closeBundle structure: finally-block reset is present (regression catcher)', () => {
      // Source-level check that the closeBundle handler has the
      // PR-S13 finally-block. A regression that removes the finally
      // would leave the cache populated across a crashed build —
      // hard to test integration-side without driving a full SSG
      // round-trip, but trivial to assert at the source level.
      //
      // The discriminator: the closeBundle body is wrapped in
      // `try { ... } finally { _resetMkdirCache() }`. We look for the
      // exact pattern of a finally-block that calls `_resetMkdirCache()`
      // — that pattern doesn't exist pre-PR-S13.
      const { readFileSync } = require('node:fs')
      const { join: pathJoin } = require('node:path')
      const src = readFileSync(
        pathJoin(__dirname, '..', 'ssg-plugin.ts'),
        'utf-8',
      )

      // Match `} finally {\n` followed (within a small window) by
      // `_resetMkdirCache()`. The `[\s\S]{0,800}` non-greedy bound
      // covers the block body + comment without over-matching the
      // unrelated `try { ... } finally { delete process.env[...] }`
      // pattern at line ~1067.
      const finallyResetRe = /\}\s*finally\s*\{[\s\S]{0,800}?_resetMkdirCache\(\)/g
      const matches = src.match(finallyResetRe) ?? []
      expect(matches.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('isInsideDist (Z3 — path-traversal containment)', () => {
    it('accepts paths inside the dist root and the root itself', () => {
      expect(_internal.isInsideDist('/app/dist', '/app/dist/about/index.html')).toBe(true)
      expect(_internal.isInsideDist('/app/dist', '/app/dist/index.html')).toBe(true)
      expect(_internal.isInsideDist('/app/dist', '/app/dist')).toBe(true)
    })

    it('rejects a SIBLING dir that merely shares the prefix (the bug)', () => {
      // Bare `startsWith(resolve(distDir))` is a string-prefix test:
      // `/app/dist-evil/x` startsWith `/app/dist` → true → write escapes
      // the output root. The separator-terminated check rejects it.
      expect(_internal.isInsideDist('/app/dist', '/app/dist-evil/x/index.html')).toBe(false)
      expect(_internal.isInsideDist('/app/dist', '/app/dist-secret')).toBe(false)
    })

    it('rejects `..` traversal out of the dist root', () => {
      expect(_internal.isInsideDist('/app/dist', '/app/dist/../evil/index.html')).toBe(false)
    })
  })
})

describe('ssg.paths precedence warning (Tier-2 F)', () => {
  it('warns when explicit ssg.paths coexists with route getStaticPaths exports', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const registry = new Map([['/posts/:id', () => [{ params: { id: 'a' } }]]])
      const paths = await _internal.resolvePaths(
        { ssg: { paths: ['/only-this'] } },
        '/nonexistent-routes-dir',
        registry as never,
        [],
      )
      expect(paths).toEqual(['/only-this'])
      const hit = warn.mock.calls.map((c) => String(c[0])).find((m) => m.includes('IGNORED'))
      expect(hit).toBeDefined()
      expect(hit).toContain('/posts/:id')
    } finally {
      warn.mockRestore()
    }
  })

  it('does not warn without getStaticPaths exports', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await _internal.resolvePaths({ ssg: { paths: ['/a'] } }, '/nx', new Map() as never, [])
      expect(warn.mock.calls.map((c) => String(c[0])).find((m) => m.includes('IGNORED'))).toBeUndefined()
    } finally {
      warn.mockRestore()
    }
  })
})

describe("format 'both' auto-canonical (Tier-2 H)", () => {
  it('joinBaseAndPath composes base and path', () => {
    expect(_internal.joinBaseAndPath('/', '/resume')).toBe('/resume')
    expect(_internal.joinBaseAndPath('/docs/', '/resume')).toBe('/docs/resume')
    expect(_internal.joinBaseAndPath('/docs', '/resume')).toBe('/docs/resume')
  })

  it('injectCanonical inserts before </head> and escapes the href', () => {
    const out = _internal.injectCanonical('<head><title>x</title></head><body></body>', '/a"b&c')
    expect(out).toContain('<link rel="canonical" href="/a&quot;b&amp;c"></head>')
  })

  it('injectCanonical leaves headless fragments unchanged', () => {
    expect(_internal.injectCanonical('<div>no head</div>', '/x')).toBe('<div>no head</div>')
  })

  it("writeRouteOutputs injects canonical into BOTH copies under format 'both'", async () => {
    const { mkdtempSync, rmSync, readFileSync } = require('node:fs')
    const { tmpdir } = require('node:os')
    const path = require('node:path')
    const dist = mkdtempSync(path.join(tmpdir(), 'pyreon-canon-'))
    try {
      const ok = await _internal.writeRouteOutputs(
        dist,
        '/resume',
        '<head></head><body>cv</body>',
        'both',
        [],
        '/',
      )
      expect(ok).toBe(true)
      const dirCopy = readFileSync(path.join(dist, 'resume', 'index.html'), 'utf-8')
      const fileCopy = readFileSync(path.join(dist, 'resume.html'), 'utf-8')
      expect(dirCopy).toContain('<link rel="canonical" href="/resume">')
      expect(fileCopy).toContain('<link rel="canonical" href="/resume">')
    } finally {
      rmSync(dist, { recursive: true, force: true })
    }
  })

  it('does NOT inject when a canonical already exists or format is single', async () => {
    const { mkdtempSync, rmSync, readFileSync } = require('node:fs')
    const { tmpdir } = require('node:os')
    const path = require('node:path')
    const dist = mkdtempSync(path.join(tmpdir(), 'pyreon-canon2-'))
    try {
      await _internal.writeRouteOutputs(
        dist,
        '/a',
        '<head><link rel="canonical" href="/custom"></head>',
        'both',
        [],
        '/',
      )
      expect(readFileSync(path.join(dist, 'a.html'), 'utf-8')).not.toContain('href="/a"')

      await _internal.writeRouteOutputs(dist, '/b', '<head></head>', 'directory', [], '/')
      expect(readFileSync(path.join(dist, 'b', 'index.html'), 'utf-8')).not.toContain('canonical')
    } finally {
      rmSync(dist, { recursive: true, force: true })
    }
  })

  it('does NOT canonicalize meta-refresh redirect stubs', async () => {
    const { mkdtempSync, rmSync, readFileSync } = require('node:fs')
    const { tmpdir } = require('node:os')
    const path = require('node:path')
    const dist = mkdtempSync(path.join(tmpdir(), 'pyreon-canon3-'))
    try {
      await _internal.writeRouteOutputs(
        dist,
        '/old',
        '<head><meta http-equiv="refresh" content="0;url=/new"></head>',
        'both',
        [],
        '/',
      )
      expect(readFileSync(path.join(dist, 'old.html'), 'utf-8')).not.toContain('canonical')
    } finally {
      rmSync(dist, { recursive: true, force: true })
    }
  })
})

describe('SSG completeness warning — routeRules exemption (Tier-4)', () => {
  it('does NOT warn when a routeRule declares the dynamic route non-static', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs')
    const { tmpdir } = require('node:os')
    const path = require('node:path')
    const root = mkdtempSync(path.join(tmpdir(), 'pyreon-rules-warn-'))
    for (const [rel, body] of Object.entries({
      'index.tsx': 'export default () => null',
      'app/[id].tsx': 'export default () => null',
    })) {
      const full = path.join(root, rel)
      mkdirSync(path.dirname(full), { recursive: true })
      writeFileSync(full, body)
    }
    const f = { routesDir: root, cleanup: () => rmSync(root, { recursive: true, force: true }) }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await _internal.autoDetectStaticPaths(f.routesDir, new Map() as never, [], undefined, {
        '/app/**': { renderMode: 'spa' },
      })
      expect(
        warn.mock.calls.map((c) => String(c[0])).find((m) => m.includes('app/[id].tsx')),
      ).toBeUndefined()
    } finally {
      warn.mockRestore()
      f.cleanup()
    }
  })
})
