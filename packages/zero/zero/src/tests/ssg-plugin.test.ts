import { describe, expect, it } from 'vitest'
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
      // The materialized entry must:
      // 1. Import the virtual route tree
      // 2. Use `createApp({ url: path })` to get a fresh router PER REQUEST
      //    (NOT createServer, which bakes in a single router that always
      //    points at "/")
      // 3. Preload loaders for the path
      // 4. Use renderWithHead to produce HTML
      // 5. Serialize loader data for hydration
      // 6. Default-export the renderer
      expect(_internal.SSR_ENTRY_SOURCE).toContain('virtual:zero/routes')
      expect(_internal.SSR_ENTRY_SOURCE).toContain('@pyreon/zero/server')
      expect(_internal.SSR_ENTRY_SOURCE).toContain('createApp')
      expect(_internal.SSR_ENTRY_SOURCE).toContain('url: path')
      expect(_internal.SSR_ENTRY_SOURCE).toContain('router.preload(path)')
      expect(_internal.SSR_ENTRY_SOURCE).toContain('renderWithHead')
      expect(_internal.SSR_ENTRY_SOURCE).toContain('serializeLoaderData')
      expect(_internal.SSR_ENTRY_SOURCE).toContain('export default')
      // Must NOT use createServer — that's the bug we fixed (single-router
      // instance baked in at app creation, can't render different paths).
      expect(_internal.SSR_ENTRY_SOURCE).not.toContain('createServer')
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

    it('passes through static segments unchanged', () => {
      expect(_internal.expandUrlPattern('/static/path', {})).toBe('/static/path')
    })
  })

  describe('autoDetectStaticPaths with getStaticPaths', () => {
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
      expect(_internal.SSR_ENTRY_SOURCE).toContain('__getStaticPathsRegistry')
      expect(_internal.SSR_ENTRY_SOURCE).toContain('collectStaticPathsRegistry')
      expect(_internal.SSR_ENTRY_SOURCE).toContain('typeof r.getStaticPaths === "function"')
      expect(_internal.SSR_ENTRY_SOURCE).toContain('Array.isArray(r.children)')
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

  describe('404 emission — SSR entry source (PR C)', () => {
    // The entry source emits an exported `__notFoundComponent` reference
    // and an async `__renderNotFound()`. Both surface to the outer plugin's
    // closeBundle: presence of the component gates emission, the renderer
    // produces `{ appHtml, head, loaderScript }` matching regular paths.
    it('exports __notFoundComponent walked from the routes tree', () => {
      expect(_internal.SSR_ENTRY_SOURCE).toContain('export const __notFoundComponent')
      expect(_internal.SSR_ENTRY_SOURCE).toContain('findNotFoundComponent(routes)')
    })

    it('walks recursively into route children', () => {
      // A `_404.tsx` under a nested layout (e.g. per-locale) attaches as
      // `notFoundComponent` on the nested layout's RouteRecord, NOT on
      // the root. The walker must descend into `r.children`.
      expect(_internal.SSR_ENTRY_SOURCE).toContain('Array.isArray(r.children)')
      expect(_internal.SSR_ENTRY_SOURCE).toContain('findNotFoundComponent(r.children)')
    })

    it('exports an async __renderNotFound that uses the same head pipeline', () => {
      expect(_internal.SSR_ENTRY_SOURCE).toContain('export async function __renderNotFound')
      // Reuses renderWithHead so styler tag + @pyreon/head meta land
      // on the rendered 404 page exactly like regular paths.
      expect(_internal.SSR_ENTRY_SOURCE).toContain('renderWithHead(vnode)')
    })

    it('returns null when no notFoundComponent exists in the tree', () => {
      expect(_internal.SSR_ENTRY_SOURCE).toContain('if (!__notFoundComponent) return null')
    })

    it('does NOT preload a router for 404 — renders the component directly', () => {
      // Mirrors the runtime's createServer wrapper which short-circuits
      // BEFORE the router for unmatched URLs and renders the not-found
      // component via h(NotFound, null). The SSG path uses the same shape.
      const renderNotFoundBlock = _internal.SSR_ENTRY_SOURCE.slice(
        _internal.SSR_ENTRY_SOURCE.indexOf('export async function __renderNotFound'),
      )
      expect(renderNotFoundBlock).not.toContain('router.preload')
      expect(renderNotFoundBlock).not.toContain('createApp')
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
    it('imports getRedirectInfo from @pyreon/router', () => {
      expect(_internal.SSR_ENTRY_SOURCE).toContain('getRedirectInfo')
      expect(_internal.SSR_ENTRY_SOURCE).toContain('"@pyreon/router"')
    })

    it('wraps router.preload in try/catch + extracts redirect info', () => {
      // The catch block calls getRedirectInfo(err) — non-redirect errors
      // rethrow into the existing errors[] flow.
      const src = _internal.SSR_ENTRY_SOURCE
      expect(src).toContain('try {')
      expect(src).toContain('await router.preload(path)')
      expect(src).toContain('getRedirectInfo(err)')
      expect(src).toContain('throw err')
    })

    it('returns a redirect descriptor with kind="redirect" + from/to/status', () => {
      // The descriptor shape must match the closeBundle's discriminated
      // union — `kind: 'redirect'` distinguishes from the HTML branch.
      const src = _internal.SSR_ENTRY_SOURCE
      expect(src).toContain('kind: "redirect"')
      expect(src).toContain('from: path')
      expect(src).toContain('to: info.url')
      expect(src).toContain('status: info.status')
    })

    it('marks the success branch with kind="html"', () => {
      // The non-redirect branch must explicitly tag its return shape so
      // the closeBundle's switch on `result.kind` is exhaustive.
      expect(_internal.SSR_ENTRY_SOURCE).toContain('kind: "html"')
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
})
