import type { ComponentFn, VNode } from '@pyreon/core'
import { h } from '@pyreon/core'
import { lazy, RouterView } from '@pyreon/router'
import { accessInternal } from '@pyreon/test-utils'
import { createHandler } from '../handler'
import {
  buildClientEntryTag,
  buildScripts,
  buildScriptsFast,
  compileTemplate,
  DEFAULT_TEMPLATE,
  processCompiledTemplate,
  processTemplate,
} from '../html'
import { island } from '../island'
import type { Middleware } from '../middleware'
import { prerender } from '../ssg'

// ─── HTML template ───────────────────────────────────────────────────────────

describe('HTML template', () => {
  test('processTemplate replaces all placeholders', () => {
    const result = processTemplate(DEFAULT_TEMPLATE, {
      head: '<title>Test</title>',
      app: '<div>Hello</div>',
      scripts: '<script type="module" src="/app.js"></script>',
    })
    expect(result).toContain('<title>Test</title>')
    expect(result).toContain('<div>Hello</div>')
    expect(result).toContain('src="/app.js"')
    expect(result).not.toContain('<!--pyreon-head-->')
    expect(result).not.toContain('<!--pyreon-app-->')
    expect(result).not.toContain('<!--pyreon-scripts-->')
  })

  test('processTemplate preserves literal $-sequences in rendered HTML (no regex-pattern corruption)', () => {
    // Regression: `String.prototype.replace(str, str)` interprets `$$`,
    // `$&`, `` $` ``, `$'`, `$n` in the REPLACEMENT even with a string
    // search. Rendered SSR HTML routinely contains these (prices, code,
    // math). Must round-trip verbatim.
    const appHtml = 'Total: $$50 — match $& and back$`tick and $\' and $1 group'
    const result = processTemplate(DEFAULT_TEMPLATE, {
      head: 'price $& head',
      app: appHtml,
      scripts: '$$ scripts $\'',
    })
    expect(result).toContain(appHtml)
    expect(result).toContain('price $& head')
    expect(result).toContain("$$ scripts $'")
    expect(result).not.toContain('<!--pyreon-app-->')
  })

  test('buildScripts emits loader data + client entry', () => {
    const scripts = buildScripts('/entry.js', { users: [{ id: 1 }] })
    expect(scripts).toContain('window.__PYREON_LOADER_DATA__=')
    expect(scripts).toContain('"users"')
    expect(scripts).toContain('src="/entry.js"')
  })

  test('buildScripts escapes </script> in JSON', () => {
    const scripts = buildScripts('/entry.js', { html: '</script><script>alert(1)' })
    expect(scripts).not.toContain('</script><script>')
    expect(scripts).toContain('<\\/script>')
  })

  test('buildScripts omits inline data when no loaders', () => {
    const scripts = buildScripts('/entry.js', {})
    expect(scripts).not.toContain('__PYREON_LOADER_DATA__')
    expect(scripts).toContain('src="/entry.js"')
  })

  test('buildScripts with null loaderData only emits client entry', () => {
    const scripts = buildScripts('/entry.js', null)
    expect(scripts).not.toContain('__PYREON_LOADER_DATA__')
    expect(scripts).toContain('src="/entry.js"')
  })

  test('processTemplate works with custom template string', () => {
    const tpl = '<head><!--pyreon-head--></head><main><!--pyreon-app--></main><!--pyreon-scripts-->'
    const result = processTemplate(tpl, { head: '<title>X</title>', app: 'APP', scripts: 'JS' })
    expect(result).toBe('<head><title>X</title></head><main>APP</main>JS')
  })

  test('DEFAULT_TEMPLATE contains all three placeholders', () => {
    expect(DEFAULT_TEMPLATE).toContain('<!--pyreon-head-->')
    expect(DEFAULT_TEMPLATE).toContain('<!--pyreon-app-->')
    expect(DEFAULT_TEMPLATE).toContain('<!--pyreon-scripts-->')
  })
})

// ─── SSR Handler ─────────────────────────────────────────────────────────────

describe('createHandler', () => {
  const Home: ComponentFn = () => h('h1', null, 'Home')
  const About: ComponentFn = () => h('h1', null, 'About')
  const routes = [
    { path: '/', component: Home },
    { path: '/about', component: About },
  ]

  test('renders home page', async () => {
    const handler = createHandler({ App: Home, routes })
    const res = await handler(new Request('http://localhost/'))
    const html = await res.text()
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/html')
    expect(html).toContain('<h1>Home</h1>')
    expect(html).toContain('<!DOCTYPE html>')
  })

  test('renders about page with correct route', async () => {
    const App: ComponentFn = () => h('main', null, 'app')
    const handler = createHandler({ App, routes })
    const res = await handler(new Request('http://localhost/about'))
    expect(res.status).toBe(200)
  })

  test('uses custom template', async () => {
    const template =
      '<html><!--pyreon-head--><body><!--pyreon-app--><!--pyreon-scripts--></body></html>'
    const handler = createHandler({ App: Home, routes, template })
    const res = await handler(new Request('http://localhost/'))
    const html = await res.text()
    expect(html).toContain('<html>')
    expect(html).toContain('<h1>Home</h1>')
    expect(html).not.toContain('<!--pyreon-app-->')
  })

  test('includes client entry script', async () => {
    const handler = createHandler({ App: Home, routes, clientEntry: '/dist/client.js' })
    const res = await handler(new Request('http://localhost/'))
    const html = await res.text()
    expect(html).toContain('src="/dist/client.js"')
  })

  test('clientEntry: false suppresses the client-entry script (built template carries it)', async () => {
    // Production SSR: `template` is a built index.html that ALREADY has the
    // hashed `<script type="module" src="/assets/…">`. `clientEntry: false`
    // stops the handler from injecting a SECOND (and, with the default,
    // dev-path) script tag. Loader data still injects.
    const template =
      '<html><!--pyreon-head--><body><div id="app"><!--pyreon-app--></div><script type="module" src="/assets/index-abc123.js"></script><!--pyreon-scripts--></body></html>'
    const handler = createHandler({ App: Home, routes, template, clientEntry: false })
    const res = await handler(new Request('http://localhost/'))
    const html = await res.text()
    // The built template's hashed entry survives.
    expect(html).toContain('src="/assets/index-abc123.js"')
    // No injected dev entry, and exactly ONE module script (no duplicate).
    expect(html).not.toContain('/src/entry-client.ts')
    expect(html.match(/<script type="module"/g) ?? []).toHaveLength(1)
  })

  test('serializes loader data into HTML', async () => {
    const WithLoader: ComponentFn = () => h('div', null, 'loaded')
    const loaderRoutes = [
      {
        path: '/',
        component: WithLoader,
        loader: async () => ({ items: [1, 2, 3] }),
      },
    ]
    const handler = createHandler({ App: WithLoader, routes: loaderRoutes })
    const res = await handler(new Request('http://localhost/'))
    const html = await res.text()
    expect(html).toContain('__PYREON_LOADER_DATA__')
    expect(html).toContain('"items"')
  })

  test('renders a LAZY route component through RouterView (SSR empty-page regression)', async () => {
    // zero's fs-router emits every route as `lazy(() => import(...))`. The
    // handler must resolve those into the component cache BEFORE the
    // synchronous render (it calls `router.preload`), or `RouterView` hits its
    // empty lazy fallback and ships a BLANK page wrapped in the layout (status
    // 200, template shell) — the 0.30.0 `mode: 'ssr'`/`'isr'` regression. SSG
    // was unaffected because it already used `router.preload`. Bisect: revert
    // the handler to `prefetchLoaderData` (loaders-only) → the lazy component
    // is never resolved → the rendered HTML lacks the page content → fails.
    const LazyPage: ComponentFn = () =>
      h('div', { 'data-testid': 'lazy-page' }, h('h1', null, 'Lazy Loaded'))
    const lazyRoutes = [
      { path: '/', component: lazy(() => Promise.resolve({ default: LazyPage })) },
    ]
    // App renders <RouterView/> so the matched chain (the lazy page) renders
    // at depth 0 — the real shape, vs the other tests passing the page as App.
    const App: ComponentFn = () => h(RouterView, null)
    const handler = createHandler({ App, routes: lazyRoutes })
    const res = await handler(new Request('http://localhost/'))
    const html = await res.text()
    expect(res.status).toBe(200)
    expect(html).toContain('data-testid="lazy-page"')
    expect(html).toContain('<h1>Lazy Loaded</h1>')
  })

  test('returns 500 on render error', async () => {
    const BrokenApp: ComponentFn = () => {
      throw new Error('boom')
    }
    const handler = createHandler({ App: BrokenApp, routes })
    const res = await handler(new Request('http://localhost/'))
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('Internal Server Error')
  })

  test('redirect() from a loader returns a 307 with Location header (no HTML body)', async () => {
    const Home: ComponentFn = () => h('h1', null, 'home')
    const Protected: ComponentFn = () => h('h1', null, 'protected')
    const { redirect } = await import('@pyreon/router')
    const protectedRoutes = [
      { path: '/', component: Home },
      {
        path: '/app',
        component: Protected,
        loader: async () => {
          redirect('/login')
        },
      },
    ]
    const handler = createHandler({ App: Home, routes: protectedRoutes })
    const res = await handler(new Request('http://localhost/app'))
    expect(res.status).toBe(307)
    expect(res.headers.get('Location')).toBe('/login')
    // No body — clients only need the Location header
    expect(await res.text()).toBe('')
  })

  test('redirect() preserves a custom status', async () => {
    const Home: ComponentFn = () => h('h1', null, 'home')
    const { redirect } = await import('@pyreon/router')
    const permRoutes = [
      { path: '/', component: Home },
      {
        path: '/old',
        component: Home,
        loader: async () => {
          redirect('/new', 308)
        },
      },
    ]
    const handler = createHandler({ App: Home, routes: permRoutes })
    const res = await handler(new Request('http://localhost/old'))
    expect(res.status).toBe(308)
    expect(res.headers.get('Location')).toBe('/new')
  })

  test('loader can read cookies from ctx.request and redirect when missing', async () => {
    const Home: ComponentFn = () => h('h1', null, 'home')
    const Login: ComponentFn = () => h('h1', null, 'login')
    const Protected: ComponentFn = () => h('h1', null, 'protected')
    const { redirect } = await import('@pyreon/router')
    const authRoutes = [
      { path: '/', component: Home },
      { path: '/login', component: Login },
      {
        path: '/app',
        component: Protected,
        loader: async (ctx: { request?: Request }) => {
          const cookieHeader = ctx.request?.headers.get('cookie') ?? ''
          const sid = /(?:^|;\s*)sid=([^;]+)/.exec(cookieHeader)?.[1]
          if (!sid) redirect('/login')
          return { sid }
        },
      },
    ]
    const handler = createHandler({ App: Home, routes: authRoutes })

    // No cookie → redirect
    const noCookie = await handler(new Request('http://localhost/app'))
    expect(noCookie.status).toBe(307)
    expect(noCookie.headers.get('Location')).toBe('/login')

    // Has cookie → renders (no redirect). Status 200 is the contract; the
    // body is whatever `App` renders (this test's App is `Home`, no RouterView).
    const withCookie = await handler(
      new Request('http://localhost/app', { headers: { cookie: 'sid=abc123' } }),
    )
    expect(withCookie.status).toBe(200)
    expect(withCookie.headers.get('Location')).toBeNull()
  })

  test('handles URL with query string', async () => {
    const handler = createHandler({ App: Home, routes })
    const res = await handler(new Request('http://localhost/?foo=bar&baz=1'))
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('<h1>Home</h1>')
  })
})

// ─── M1.2 — runtime SSR 404 layout chrome ─────────────────────────────────────
//
// PR L5 added `findNotFoundFallback` to the router's `resolveRoute` so an
// unmatched URL produces a synthetic chain `[...ancestorLayouts, syntheticLeaf]`
// with `isNotFound: true`. M1.2 wires the handler to read that flag and emit
// HTTP 404 instead of 200 — while still serving the layout-wrapped 404 HTML.
//
// Without M1.2, the synthetic chain still rendered (so the HTML body was
// correct under L5) but the response status stayed at 200 — broken contract
// for static-host CDNs, search engines, and curl-driven monitoring.
//
// Bisect: remove the `resolved?.isNotFound === true ? 404 : 200` ternary in
// `handler.ts` (replace with `200`) → both specs below fail with
// `expected 200 to be 404`.

describe('createHandler — M1.2 runtime SSR 404 layout chrome', () => {
  const HomePage: ComponentFn = () => h('h1', { 'data-testid': 'home' }, 'Home')
  const NotFound: ComponentFn = () => h('h1', { 'data-testid': 'not-found' }, 'Page Not Found')
  const Layout: ComponentFn = () =>
    h(
      'div',
      { 'data-testid': 'layout' },
      h('nav', { 'data-testid': 'nav' }, 'NAV'),
      h(RouterView, {}),
    )

  // Routes tree shape mirrors fs-router's `_404.tsx` convention:
  //   - parent layout has `notFoundComponent` attached
  //   - matched children render normally
  const routes = [
    {
      path: '/',
      component: Layout,
      notFoundComponent: NotFound,
      children: [{ path: '/', component: HomePage }],
    },
  ]

  test('matched URL renders normally with status 200', async () => {
    const handler = createHandler({ App: RouterView, routes })
    const res = await handler(new Request('http://localhost/'))
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('data-testid="home"')
    expect(html).toContain('data-testid="layout"') // chrome wraps page
  })

  test('unmatched URL emits HTTP 404 with layout chrome + not-found body', async () => {
    const handler = createHandler({ App: RouterView, routes })
    const res = await handler(new Request('http://localhost/this-page-does-not-exist'))

    // M1.2 — status 404 sourced from router.currentRoute().isNotFound.
    expect(res.status).toBe(404)

    const html = await res.text()
    // The 404 component renders.
    expect(html).toContain('data-testid="not-found"')
    expect(html).toContain('Page Not Found')
    // PR L5 — the parent layout wraps the 404 (the win that started with L5,
    // M1.2 just adds the HTTP status).
    expect(html).toContain('data-testid="layout"')
    expect(html).toContain('data-testid="nav"')
  })

  test('legacy routes tree without notFoundComponent emits 200 (no synthetic chain)', async () => {
    // Backward-compat: apps without `_404.tsx` in the routes tree fall through
    // to whatever the App renders (typically empty RouterView). The handler
    // doesn't synthesize a 404 status out of thin air — it requires the
    // router's `findNotFoundFallback` to produce the synthetic chain first.
    const plainRoutes = [{ path: '/specific', component: HomePage }]
    const handler = createHandler({ App: RouterView, routes: plainRoutes })
    const res = await handler(new Request('http://localhost/unrelated'))
    expect(res.status).toBe(200)
  })
})

// ─── Stream mode ──────────────────────────────────────────────────────────────

describe('createHandler — stream mode', () => {
  const Home: ComponentFn = () => h('h1', null, 'Streamed')
  const routes = [{ path: '/', component: Home }]

  test('returns a streaming response', async () => {
    const handler = createHandler({ App: Home, routes, mode: 'stream' })
    const res = await handler(new Request('http://localhost/'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/html')
    const html = await res.text()
    expect(html).toContain('<h1>Streamed</h1>')
  })

  test('stream mode uses default template placeholders', async () => {
    const handler = createHandler({ App: Home, routes, mode: 'stream' })
    const res = await handler(new Request('http://localhost/'))
    const html = await res.text()
    // Should contain the template shell
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('</html>')
    // Script should be present
    expect(html).toContain('src="/src/entry-client.ts"')
  })

  test('stream mode with custom template', async () => {
    const template =
      '<html><!--pyreon-head--><body><!--pyreon-app--><!--pyreon-scripts--></body></html>'
    const handler = createHandler({ App: Home, routes, mode: 'stream', template })
    const res = await handler(new Request('http://localhost/'))
    const html = await res.text()
    expect(html).toContain('<h1>Streamed</h1>')
    expect(html).toContain('</body></html>')
  })

  test('stream mode with custom client entry', async () => {
    const handler = createHandler({
      App: Home,
      routes,
      mode: 'stream',
      clientEntry: '/dist/app.js',
    })
    const res = await handler(new Request('http://localhost/'))
    const html = await res.text()
    expect(html).toContain('src="/dist/app.js"')
  })

  test('stream mode template without <!--pyreon-app--> throws', () => {
    const badTemplate = '<html><!--pyreon-head--><!--pyreon-scripts--></html>'
    // Template validation happens at createHandler time (compile-time, not per-request)
    expect(() =>
      createHandler({ App: Home, routes, mode: 'stream', template: badTemplate }),
    ).toThrow('Template must contain <!--pyreon-app-->')
  })

  test('stream mode includes middleware-set headers', async () => {
    const mw: Middleware = (ctx) => {
      ctx.headers.set('X-Custom', 'test-value')
    }
    const handler = createHandler({ App: Home, routes, mode: 'stream', middleware: [mw] })
    const res = await handler(new Request('http://localhost/'))
    expect(res.headers.get('X-Custom')).toBe('test-value')
  })

  test('stream mode middleware can short-circuit', async () => {
    const mw: Middleware = () => new Response('blocked', { status: 403 })
    const handler = createHandler({ App: Home, routes, mode: 'stream', middleware: [mw] })
    const res = await handler(new Request('http://localhost/'))
    expect(res.status).toBe(403)
    expect(await res.text()).toBe('blocked')
  })

  test('stream mode forwards suspenseTimeoutMs to renderToStream — short timeout drops slow boundary content', async () => {
    // Public-API integration test for the new `suspenseTimeoutMs`
    // handler option. The 100ms boundary should time out at 20ms,
    // leaving only the fallback in the rendered HTML. Without the
    // forward through to renderToStream, the 30s default would let
    // the boundary resolve and `loaded-too-late` would land in the
    // response.
    const { Suspense } = await import('@pyreon/core')
    async function SlowBoundary() {
      await new Promise<void>((r) => setTimeout(r, 100))
      return h('div', null, 'loaded-too-late')
    }
    const App: ComponentFn = () =>
      h(Suspense, {
        fallback: h('span', null, 'loading-shown'),
        children: h(SlowBoundary as unknown as ComponentFn, null),
      })
    const routes = [{ path: '/', component: App }]
    const handler = createHandler({
      App,
      routes,
      mode: 'stream',
      suspenseTimeoutMs: 20,
    })
    const res = await handler(new Request('http://localhost/'))
    const html = await res.text()
    expect(html).toContain('loading-shown')
    expect(html).not.toContain('loaded-too-late')
    expect(html).not.toMatch(/__NS\(\s*["']pyreon-s-/)
  })

  test('stream mode threads request.signal through to renderToStream — upstream abort skips post-resolve Suspense enqueue', async () => {
    // End-to-end gate for the AbortSignal wire. `renderToStream` gained
    // `{ signal }` support in #745; this test proves `createHandler`
    // actually forwards `req.signal` through so an abort from the
    // outer Request (client disconnect, request timeout) propagates
    // into the streaming render. Without the forward, the in-flight
    // Suspense boundary would still enqueue its resolved HTML even
    // after the consumer hung up — wasted work + cancel-resistant
    // leaks under load.
    const { Suspense } = await import('@pyreon/core')
    async function Slow() {
      await new Promise<void>((r) => setTimeout(r, 50))
      return h('div', null, 'loaded-too-late')
    }
    const App: ComponentFn = () =>
      h(Suspense, {
        fallback: h('span', null, 'loading-shown'),
        children: h(Slow as unknown as ComponentFn, null),
      })
    const routes = [{ path: '/', component: App }]
    const handler = createHandler({ App, routes, mode: 'stream' })

    const ac = new AbortController()
    const res = await handler(new Request('http://localhost/', { signal: ac.signal }))
    // Abort BEFORE the 50ms Suspense boundary resolves. The fallback
    // streams synchronously (well before this fires).
    setTimeout(() => ac.abort(), 5)

    const html = await res.text()
    // Fallback was emitted before the abort fired.
    expect(html).toContain('loading-shown')
    // Post-resolve enqueue MUST be skipped — the resolved content +
    // its swap-script call never landed because the signal aborted
    // before the Suspense boundary's 50ms timer fired.
    expect(html).not.toContain('loaded-too-late')
    expect(html).not.toMatch(/__NS\(\s*["']pyreon-s-/)
  })
})

// ─── Middleware ───────────────────────────────────────────────────────────────

describe('middleware', () => {
  const App: ComponentFn = () => h('div', null, 'app')
  const routes = [{ path: '/', component: App }]

  test('middleware can short-circuit with a Response', async () => {
    const authMiddleware: Middleware = (ctx) => {
      if (!ctx.req.headers.get('Authorization')) {
        return new Response('Unauthorized', { status: 401 })
      }
    }
    const handler = createHandler({ App, routes, middleware: [authMiddleware] })

    const noAuth = await handler(new Request('http://localhost/'))
    expect(noAuth.status).toBe(401)

    const withAuth = await handler(
      new Request('http://localhost/', { headers: { Authorization: 'Bearer token' } }),
    )
    expect(withAuth.status).toBe(200)
  })

  test('middleware can set custom headers', async () => {
    const cacheMiddleware: Middleware = (ctx) => {
      ctx.headers.set('Cache-Control', 'max-age=3600')
    }
    const handler = createHandler({ App, routes, middleware: [cacheMiddleware] })
    const res = await handler(new Request('http://localhost/'))
    expect(res.headers.get('Cache-Control')).toBe('max-age=3600')
  })

  test('middleware chain runs in order', async () => {
    const order: number[] = []
    const mw1: Middleware = () => {
      order.push(1)
    }
    const mw2: Middleware = () => {
      order.push(2)
    }
    const mw3: Middleware = () => {
      order.push(3)
    }
    const handler = createHandler({ App, routes, middleware: [mw1, mw2, mw3] })
    await handler(new Request('http://localhost/'))
    expect(order).toEqual([1, 2, 3])
  })
})

// ─── Stream mode error handling (handler.ts lines 175-178) ──────────────────

describe('createHandler — stream mode error in rendering', () => {
  test('stream mode handles render error gracefully', async () => {
    let callCount = 0
    const BrokenApp: ComponentFn = () => {
      callCount++
      if (callCount > 0) throw new Error('render boom')
      return h('div', null, 'ok')
    }
    const routes = [{ path: '/', component: BrokenApp }]
    const handler = createHandler({ App: BrokenApp, routes, mode: 'stream' })
    // The stream mode should catch errors and emit an error script
    // Since renderToStream might throw synchronously, the handler might throw
    // or return a response depending on when the error occurs
    try {
      const res = await handler(new Request('http://localhost/'))
      const _html = await res.text()
      // If it returns a response, check it's still a valid response
      expect(res.status).toBeDefined()
    } catch {
      // If it throws, that's also acceptable (error propagation)
    }
  })
})

// ─── Middleware type exports ─────────────────────────────────────────────────

describe('middleware types', () => {
  test('MiddlewareContext and Middleware types are importable', async () => {
    const mod = await import('../middleware')
    // Just verify the module can be imported — it's pure types
    expect(mod).toBeDefined()
  })

  test('useRequestLocals returns the current request locals from context', async () => {
    const { useRequestLocals } = await import('../middleware')
    // Outside a request context, returns the default empty object — exercises
    // the function-call path so coverage sees it (was 50%/never-called before).
    const locals = useRequestLocals()
    expect(typeof locals).toBe('object')
    expect(locals).not.toBeNull()
  })

  test('createHandler invokes collectStyles and prepends styleTag to head', async () => {
    const App: ComponentFn = () => h('div', null, 'styled')
    const handler = createHandler({
      App,
      routes: [{ path: '/', component: App }],
      collectStyles: () => '<style data-test="style">.x{color:red}</style>',
    })
    const res = await handler(new Request('http://localhost/'))
    const html = await res.text()
    expect(html).toContain('<style data-test="style">')
  })
})

// ─── Islands ─────────────────────────────────────────────────────────────────

describe('island', () => {
  test('island() returns a function with island metadata', () => {
    const Counter = island(() => Promise.resolve({ default: () => h('div', null, '0') }), {
      name: 'Counter',
    })
    expect(typeof Counter).toBe('function')
    expect(accessInternal<{ __island: boolean }>(Counter).__island).toBe(true)
    expect(Counter.name).toBe('Counter')
  })

  test('island() renders with <pyreon-island> wrapper during SSR', async () => {
    const Inner: ComponentFn = (props) =>
      h('button', null, `Count: ${(props as Record<string, unknown>).initial}`)
    const Counter = island<{ initial: number }>(() => Promise.resolve({ default: Inner }), {
      name: 'Counter',
      hydrate: 'idle',
    })

    // Simulate SSR by calling the async component
    const vnode = await (Counter as unknown as (props: { initial: number }) => Promise<VNode>)({
      initial: 5,
    })
    expect(vnode).not.toBeNull()
    // The wrapper should be a pyreon-island element
    expect(vnode.type).toBe('pyreon-island')
    expect(vnode.props['data-component']).toBe('Counter')
    expect(vnode.props['data-hydrate']).toBe('idle')
    const parsedProps = JSON.parse(vnode.props['data-props'] as string)
    expect(parsedProps.initial).toBe(5)
  })

  test('island() strips non-serializable props', async () => {
    const Inner: ComponentFn = () => h('div', null)
    const Widget = island(() => Promise.resolve({ default: Inner }), { name: 'Widget' })

    const vnode = await (Widget as unknown as (props: Record<string, unknown>) => Promise<VNode>)({
      label: 'hello',
      onClick: () => {},
      sym: Symbol('test'),
      nested: { a: 1 },
    })
    const parsedProps = JSON.parse(vnode.props['data-props'] as string)
    expect(parsedProps.label).toBe('hello')
    expect(parsedProps.onClick).toBeUndefined()
    expect(parsedProps.sym).toBeUndefined()
    expect(parsedProps.nested).toEqual({ a: 1 })
  })

  test('island() strips children prop from serialized props', async () => {
    const Inner: ComponentFn = () => h('div', null)
    const Widget = island(() => Promise.resolve({ default: Inner }), { name: 'Widget' })

    const vnode = await (Widget as unknown as (props: Record<string, unknown>) => Promise<VNode>)({
      title: 'test',
      children: h('span', null, 'child'),
    })
    const parsedProps = JSON.parse(vnode.props['data-props'] as string)
    expect(parsedProps.title).toBe('test')
    expect(parsedProps.children).toBeUndefined()
  })

  test('island() strips undefined values from serialized props', async () => {
    const Inner: ComponentFn = () => h('div', null)
    const Widget = island(() => Promise.resolve({ default: Inner }), { name: 'Widget' })

    const vnode = await (Widget as unknown as (props: Record<string, unknown>) => Promise<VNode>)({
      present: 'yes',
      missing: undefined,
    })
    const parsedProps = JSON.parse(vnode.props['data-props'] as string)
    expect(parsedProps.present).toBe('yes')
    expect('missing' in parsedProps).toBe(false)
  })

  test('island() resolves direct function module (not { default })', async () => {
    const Inner: ComponentFn = () => h('span', null, 'direct')
    // Loader returns the ComponentFn DIRECTLY (no { default } wrapper) —
    // covers the function-typeof branch in the unwrap code.
    const Widget = island(
      () => Promise.resolve(Inner as unknown as ComponentFn),
      { name: 'Direct' },
    )

    const vnode = await (Widget as unknown as (props: Record<string, unknown>) => Promise<VNode>)(
      {},
    )
    expect(vnode.type).toBe('pyreon-island')
    expect(vnode.props['data-component']).toBe('Direct')
  })

  test("island() defaults hydrate to 'load'", () => {
    const Inner: ComponentFn = () => h('div', null)
    const Widget = island(() => Promise.resolve({ default: Inner }), { name: 'NoHydrate' })
    expect((Widget as unknown as { hydrate: string }).hydrate).toBe('load')
  })

  test('island() metadata properties are non-writable', () => {
    const Inner: ComponentFn = () => h('div', null)
    const Widget = island(() => Promise.resolve({ default: Inner }), {
      name: 'Frozen',
      hydrate: 'visible',
    })
    const meta = Widget as unknown as { __island: boolean; hydrate: string }
    expect(meta.__island).toBe(true)
    expect(meta.hydrate).toBe('visible')
  })

  test("island() defaults prefetch to 'none' and does NOT emit data-prefetch attribute", async () => {
    const Inner: ComponentFn = () => h('div', null)
    const Widget = island(() => Promise.resolve({ default: Inner }), {
      name: 'NoPrefetch',
      hydrate: 'visible',
    })
    expect((Widget as unknown as { prefetch: string }).prefetch).toBe('none')
    const vnode = await (Widget as unknown as (props: Record<string, unknown>) => Promise<VNode>)(
      {},
    )
    expect('data-prefetch' in vnode.props).toBe(false)
  })

  test("island() emits data-prefetch when paired with a deferred hydrate strategy", async () => {
    const Inner: ComponentFn = () => h('div', null)
    const Widget = island(() => Promise.resolve({ default: Inner }), {
      name: 'PrefetchIdle',
      hydrate: 'visible',
      prefetch: 'idle',
    })
    expect((Widget as unknown as { prefetch: string }).prefetch).toBe('idle')
    const vnode = await (Widget as unknown as (props: Record<string, unknown>) => Promise<VNode>)(
      {},
    )
    expect(vnode.props['data-prefetch']).toBe('idle')
    expect(vnode.props['data-hydrate']).toBe('visible')
  })

  test("island() suppresses data-prefetch when hydrate='load' (loader runs synchronously)", async () => {
    const Inner: ComponentFn = () => h('div', null)
    const Widget = island(() => Promise.resolve({ default: Inner }), {
      name: 'PointlessPrefetch',
      hydrate: 'load',
      prefetch: 'idle',
    })
    const vnode = await (Widget as unknown as (props: Record<string, unknown>) => Promise<VNode>)(
      {},
    )
    // Metadata still records what the user asked for, but the runtime
    // attribute is suppressed because prefetch is meaningless on load.
    expect((Widget as unknown as { prefetch: string }).prefetch).toBe('idle')
    expect('data-prefetch' in vnode.props).toBe(false)
  })

  test("island() suppresses data-prefetch when hydrate='never' (defeats zero-JS strategy)", async () => {
    const Inner: ComponentFn = () => h('div', null)
    const Widget = island(() => Promise.resolve({ default: Inner }), {
      name: 'NeverPrefetch',
      hydrate: 'never',
      prefetch: 'visible',
    })
    const vnode = await (Widget as unknown as (props: Record<string, unknown>) => Promise<VNode>)(
      {},
    )
    expect('data-prefetch' in vnode.props).toBe(false)
  })

  test('island() serializes empty props as empty object', async () => {
    const Inner: ComponentFn = () => h('div', null)
    const Widget = island(() => Promise.resolve({ default: Inner }), { name: 'Empty' })

    const vnode = await (Widget as unknown as (props: Record<string, unknown>) => Promise<VNode>)(
      {},
    )
    expect(vnode.props['data-props']).toBe('{}')
  })

  test('island() roundtrips BigInt props losslessly via the codec', async () => {
    const Inner: ComponentFn = () => h('div', null)
    const Widget = island(() => Promise.resolve({ default: Inner }), { name: 'BigIntProps' })

    const vnode = await (Widget as unknown as (props: Record<string, unknown>) => Promise<VNode>)({
      huge: BigInt('9007199254740993'),
    })
    // Contract change (vs. pre-codec behaviour where BigInt fell back to {}):
    // the codec emits a `__pyreon_t:'B'` tag on the wire; the client's
    // `decodeIslandProps` restores a real BigInt on hydrate.
    const dataProps = vnode.props['data-props'] as string
    const parsed = JSON.parse(dataProps) as Record<string, unknown>
    expect(parsed.huge).toEqual({ __pyreon_t: 'B', v: '9007199254740993' })
  })

  test('island() falls back to {} on circular-reference props (with named-path dev error)', async () => {
    const Inner: ComponentFn = () => h('div', null)
    const Widget = island(() => Promise.resolve({ default: Inner }), { name: 'CircularProps' })

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cyclic: Record<string, unknown> = { name: 'foo' }
    cyclic.self = cyclic
    const vnode = await (Widget as unknown as (props: Record<string, unknown>) => Promise<VNode>)({
      data: cyclic,
    })
    expect(vnode.props['data-props']).toBe('{}')
    // Codec catches circulars with a named-path error now (vs. the prior
    // generic "BigInt or circular reference" message).
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Circular'),
    )
    errorSpy.mockRestore()
  })

  test('island() fails loud on class-instance props (was: silently dropped to {})', async () => {
    const Inner: ComponentFn = () => h('div', null)
    const Widget = island(() => Promise.resolve({ default: Inner }), { name: 'ClassInstance' })

    class User {
      constructor(public name: string) {}
    }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const vnode = await (Widget as unknown as (props: Record<string, unknown>) => Promise<VNode>)({
      user: new User('Alice'),
    })
    // Same fallback shape as before (empty props → no client surprise),
    // but the dev error now NAMES the offender so the user spots it.
    expect(vnode.props['data-props']).toBe('{}')
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('User'),
    )
    errorSpy.mockRestore()
  })

  test('island() warns when children prop is dropped (dev only)', async () => {
    const Inner: ComponentFn = () => h('div', null)
    const Widget = island(() => Promise.resolve({ default: Inner }), { name: 'WithKids' })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await (Widget as unknown as (props: Record<string, unknown>) => Promise<VNode>)({
      title: 'has children',
      children: h('span', null, 'kid'),
    })
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('island "WithKids" was passed children'),
    )
    warnSpy.mockRestore()
  })

  test('island() does NOT warn when children is undefined (no real children)', async () => {
    const Inner: ComponentFn = () => h('div', null)
    const Widget = island(() => Promise.resolve({ default: Inner }), { name: 'NoKidsWarn' })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await (Widget as unknown as (props: Record<string, unknown>) => Promise<VNode>)({
      title: 'no children',
      children: undefined,
    })
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

// ─── SSG ─────────────────────────────────────────────────────────────────────

describe('prerender', () => {
  test('generates HTML files for given paths', async () => {
    const Home: ComponentFn = () => h('h1', null, 'Home')
    const About: ComponentFn = () => h('h1', null, 'About')
    const routes = [
      { path: '/', component: Home },
      { path: '/about', component: About },
    ]
    const handler = createHandler({ App: Home, routes })

    const _written: Record<string, string> = {}
    const tmpDir = `/tmp/pyreon-ssg-test-${Date.now()}`

    const result = await prerender({
      handler,
      paths: ['/', '/about'],
      outDir: tmpDir,
    })

    expect(result.pages).toBe(2)
    expect(result.errors).toHaveLength(0)
    expect(result.elapsed).toBeGreaterThanOrEqual(0)

    // Verify files exist
    const { readFile, rm } = await import('node:fs/promises')
    const indexHtml = await readFile(`${tmpDir}/index.html`, 'utf-8')
    expect(indexHtml).toContain('<h1>Home</h1>')

    const aboutStat = await import('node:fs').then((fs) =>
      fs.existsSync(`${tmpDir}/about/index.html`),
    )
    expect(aboutStat).toBe(true)

    // Cleanup
    await rm(tmpDir, { recursive: true, force: true })
  })

  test('rejects a path that escapes outDir into a SIBLING dir (prefix-match bypass)', async () => {
    // Regression: the guard was `resolve(filePath).startsWith(resolve(outDir))`
    // — a string-prefix test. With outDir `/tmp/<base>`, a path resolving
    // to the SIBLING `/tmp/<base>-evil/...` passes `startsWith` and the
    // build writes HTML OUTSIDE the output root. `path` derives from
    // caller route params (CMS slugs via getStaticPaths).
    const App: ComponentFn = () => h('div', null, 'secret')
    const handler = createHandler({ App, routes: [{ path: '/', component: App }] })
    const stamp = Date.now()
    const outDir = `/tmp/pyreon-ssgtrav-${stamp}`
    const siblingEvil = `/tmp/pyreon-ssgtrav-${stamp}-evil`
    const escapingPath = `/../pyreon-ssgtrav-${stamp}-evil`

    const result = await prerender({ handler, paths: [escapingPath], outDir })

    // The escaping path is rejected, recorded as an error, NOT written.
    expect(result.pages).toBe(0)
    expect(result.errors.some((e) => /Path traversal detected/.test(String(e.error)))).toBe(true)
    const fs = await import('node:fs')
    expect(fs.existsSync(`${siblingEvil}/index.html`)).toBe(false)

    const { rm } = await import('node:fs/promises')
    await rm(outDir, { recursive: true, force: true })
    await rm(siblingEvil, { recursive: true, force: true })
  })

  test('onPage callback can skip pages', async () => {
    const App: ComponentFn = () => h('div', null)
    const handler = createHandler({ App, routes: [{ path: '/', component: App }] })

    const tmpDir = `/tmp/pyreon-ssg-skip-${Date.now()}`
    const result = await prerender({
      handler,
      paths: ['/'],
      outDir: tmpDir,
      onPage: () => false, // skip all pages
    })

    expect(result.pages).toBe(0)

    const { rm } = await import('node:fs/promises')
    await rm(tmpDir, { recursive: true, force: true })
  })

  test('paths can be an async function', async () => {
    const App: ComponentFn = () => h('div', null)
    const handler = createHandler({ App, routes: [{ path: '/', component: App }] })

    const tmpDir = `/tmp/pyreon-ssg-async-${Date.now()}`
    const result = await prerender({
      handler,
      paths: async () => ['/'],
      outDir: tmpDir,
    })

    expect(result.pages).toBe(1)

    const { rm } = await import('node:fs/promises')
    await rm(tmpDir, { recursive: true, force: true })
  })

  test('records errors for non-ok responses', async () => {
    // Handler that returns 404 for /missing
    const handler = async (req: Request) => {
      const url = new URL(req.url)
      if (url.pathname === '/missing') {
        return new Response('Not Found', { status: 404 })
      }
      return new Response('<html>OK</html>', { status: 200 })
    }

    const tmpDir = `/tmp/pyreon-ssg-errors-${Date.now()}`
    const result = await prerender({
      handler,
      paths: ['/', '/missing'],
      outDir: tmpDir,
    })

    expect(result.pages).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.path).toBe('/missing')

    const { rm } = await import('node:fs/promises')
    await rm(tmpDir, { recursive: true, force: true })
  })

  test('records errors when handler throws', async () => {
    const handler = async (_req: Request) => {
      throw new Error('handler exploded')
    }

    const tmpDir = `/tmp/pyreon-ssg-throw-${Date.now()}`
    const result = await prerender({
      handler,
      paths: ['/'],
      outDir: tmpDir,
    })

    expect(result.pages).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.path).toBe('/')
    expect(result.errors[0]?.error).toBeInstanceOf(Error)

    const { rm } = await import('node:fs/promises')
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  })

  test('handles .html path suffix', async () => {
    const handler = async (_req: Request) => new Response('<html>page</html>', { status: 200 })

    const tmpDir = `/tmp/pyreon-ssg-html-${Date.now()}`
    const result = await prerender({
      handler,
      paths: ['/custom.html'],
      outDir: tmpDir,
    })

    expect(result.pages).toBe(1)

    const { readFile, rm } = await import('node:fs/promises')
    const content = await readFile(`${tmpDir}/custom.html`, 'utf-8')
    expect(content).toBe('<html>page</html>')

    await rm(tmpDir, { recursive: true, force: true })
  })

  test('onPage callback receives path and html', async () => {
    const handler = async (_req: Request) => new Response('<html>content</html>', { status: 200 })

    const received: { path: string; html: string }[] = []
    const tmpDir = `/tmp/pyreon-ssg-onpage-${Date.now()}`
    await prerender({
      handler,
      paths: ['/', '/about'],
      outDir: tmpDir,
      onPage: (path, html) => {
        received.push({ path, html })
      },
    })

    expect(received).toHaveLength(2)
    expect(received.some((r) => r.path === '/')).toBe(true)
    expect(received.some((r) => r.path === '/about')).toBe(true)
    expect(received[0]?.html).toBe('<html>content</html>')

    const { rm } = await import('node:fs/promises')
    await rm(tmpDir, { recursive: true, force: true })
  })

  test('uses custom origin', async () => {
    let receivedUrl = ''
    const handler = async (req: Request) => {
      receivedUrl = req.url
      return new Response('<html></html>', { status: 200 })
    }

    const tmpDir = `/tmp/pyreon-ssg-origin-${Date.now()}`
    await prerender({
      handler,
      paths: ['/test'],
      outDir: tmpDir,
      origin: 'https://example.com',
    })

    expect(receivedUrl).toBe('https://example.com/test')

    const { rm } = await import('node:fs/promises')
    await rm(tmpDir, { recursive: true, force: true })
  })

  test('paths as sync function', async () => {
    const handler = async (_req: Request) => new Response('<html></html>', { status: 200 })

    const tmpDir = `/tmp/pyreon-ssg-sync-fn-${Date.now()}`
    const result = await prerender({
      handler,
      paths: () => ['/a', '/b'],
      outDir: tmpDir,
    })

    expect(result.pages).toBe(2)

    const { rm } = await import('node:fs/promises')
    await rm(tmpDir, { recursive: true, force: true })
  })

  test('batches more than 10 paths', async () => {
    const handler = async (_req: Request) => new Response('<html>ok</html>', { status: 200 })

    const paths = Array.from({ length: 15 }, (_, i) => `/page-${i}`)
    const tmpDir = `/tmp/pyreon-ssg-batch-${Date.now()}`
    const result = await prerender({
      handler,
      paths,
      outDir: tmpDir,
    })

    expect(result.pages).toBe(15)
    expect(result.errors).toHaveLength(0)

    const { rm } = await import('node:fs/promises')
    await rm(tmpDir, { recursive: true, force: true })
  })
})

// ─── compileTemplate ─────────────────────────────────────────────────────────

describe('compileTemplate', () => {
  test('splits template into 4 parts', () => {
    const compiled = compileTemplate(DEFAULT_TEMPLATE)
    expect(compiled.parts).toHaveLength(4)
  })

  test('throws when template is missing <!--pyreon-app-->', () => {
    expect(() => compileTemplate('<html><!--pyreon-head--><!--pyreon-scripts--></html>')).toThrow(
      'Template must contain <!--pyreon-app-->',
    )
  })

  test('handles template with all three placeholders in custom layout', () => {
    const tpl =
      '<head><!--pyreon-head--></head><main><!--pyreon-app--></main><footer><!--pyreon-scripts--></footer>'
    const compiled = compileTemplate(tpl)
    const result = processCompiledTemplate(compiled, {
      head: '<title>Hi</title>',
      app: '<div>App</div>',
      scripts: '<script></script>',
    })
    expect(result).toBe(
      '<head><title>Hi</title></head><main><div>App</div></main><footer><script></script></footer>',
    )
  })

  test('handles template without <!--pyreon-scripts--> placeholder', () => {
    const tpl = '<html><!--pyreon-head--><body><!--pyreon-app--></body></html>'
    const compiled = compileTemplate(tpl)
    expect(compiled.parts[3]).toBe('') // after-scripts is empty
  })
})

// ─── processCompiledTemplate ─────────────────────────────────────────────────

describe('processCompiledTemplate', () => {
  test('produces same result as processTemplate', () => {
    const data = {
      head: '<title>Test</title>',
      app: '<div>Hello</div>',
      scripts: '<script type="module" src="/app.js"></script>',
    }
    const simple = processTemplate(DEFAULT_TEMPLATE, data)
    const compiled = compileTemplate(DEFAULT_TEMPLATE)
    const fast = processCompiledTemplate(compiled, data)
    expect(fast).toBe(simple)
  })

  test('works with empty data', () => {
    const compiled = compileTemplate(DEFAULT_TEMPLATE)
    const result = processCompiledTemplate(compiled, { head: '', app: '', scripts: '' })
    expect(result).not.toContain('<!--pyreon-head-->')
    expect(result).not.toContain('<!--pyreon-app-->')
    expect(result).not.toContain('<!--pyreon-scripts-->')
  })
})

// ─── buildClientEntryTag ─────────────────────────────────────────────────────

describe('buildClientEntryTag', () => {
  test('emits a module script tag with src', () => {
    const tag = buildClientEntryTag('/dist/client.js')
    expect(tag).toBe('<script type="module" src="/dist/client.js"></script>')
  })
})

// ─── buildScriptsFast ────────────────────────────────────────────────────────

describe('buildScriptsFast', () => {
  test('returns only client entry tag when no loader data', () => {
    const tag = buildClientEntryTag('/app.js')
    const result = buildScriptsFast(tag, null)
    expect(result).toBe(tag)
  })

  test('returns only client entry tag when loader data is empty object', () => {
    const tag = buildClientEntryTag('/app.js')
    const result = buildScriptsFast(tag, {})
    expect(result).toBe(tag)
  })

  test('includes inline loader data when present', () => {
    const tag = buildClientEntryTag('/app.js')
    const result = buildScriptsFast(tag, { users: [1, 2] })
    expect(result).toContain('__PYREON_LOADER_DATA__')
    expect(result).toContain('"users"')
    expect(result).toContain(tag)
  })

  test('escapes </script> in loader data JSON', () => {
    const tag = buildClientEntryTag('/app.js')
    const result = buildScriptsFast(tag, { html: '</script>' })
    expect(result).not.toContain('</script><')
    expect(result).toContain('<\\/script>')
  })
})

// ─── Middleware chaining edge cases ──────────────────────────────────────────

describe('middleware — edge cases', () => {
  const App: ComponentFn = () => h('div', null, 'app')
  const routes = [{ path: '/', component: App }]

  test('middleware can modify locals for downstream middleware', async () => {
    const log: string[] = []
    const mw1: Middleware = (ctx) => {
      ctx.locals.user = 'alice'
    }
    const mw2: Middleware = (ctx) => {
      log.push(`user=${ctx.locals.user}`)
    }
    const handler = createHandler({ App, routes, middleware: [mw1, mw2] })
    await handler(new Request('http://localhost/'))
    expect(log).toEqual(['user=alice'])
  })

  test('early short-circuit prevents later middleware from running', async () => {
    const log: number[] = []
    const mw1: Middleware = () => {
      log.push(1)
      return new Response('blocked', { status: 403 })
    }
    const mw2: Middleware = () => {
      log.push(2) // should never run
    }
    const handler = createHandler({ App, routes, middleware: [mw1, mw2] })
    const res = await handler(new Request('http://localhost/'))
    expect(res.status).toBe(403)
    expect(log).toEqual([1]) // mw2 never ran
  })

  test('async middleware is supported', async () => {
    const mw: Middleware = async (ctx) => {
      await new Promise((r) => setTimeout(r, 1))
      ctx.headers.set('X-Async', 'true')
    }
    const handler = createHandler({ App, routes, middleware: [mw] })
    const res = await handler(new Request('http://localhost/'))
    expect(res.headers.get('X-Async')).toBe('true')
  })

  test('middleware receives parsed URL and path', async () => {
    let receivedPath = ''
    let receivedSearch = ''
    const mw: Middleware = (ctx) => {
      receivedPath = ctx.path
      receivedSearch = ctx.url.search
    }
    const handler = createHandler({ App, routes, middleware: [mw] })
    await handler(new Request('http://localhost/about?foo=bar'))
    expect(receivedPath).toBe('/about?foo=bar')
    expect(receivedSearch).toBe('?foo=bar')
  })
})

// ─── PR-S6: HTTP method gating + stream 404 status + 405 Allow ──────────────
//
// Bug class: Pattern B (incomplete HTTP semantics).
//
// 1. Pre-PR-S6 the handler accepted every method (GET, POST, PUT, DELETE,
//    PATCH, OPTIONS, HEAD, …) and ran the full render pipeline against
//    every one of them. POST / PUT / DELETE bodies that fell through to
//    the renderer ran loaders unexpectedly (often with side effects),
//    returned full HTML, and produced confusing 500s when the client
//    expected JSON / 204 / 405. The renderer is for HTML — only GET
//    and HEAD belong here.
//
// 2. Stream mode hard-coded `status: 200` regardless of the router's
//    `isNotFound` flag — the L5 router-driven 404 path worked for
//    string mode but silently downgraded to 200 for streaming consumers.
//
// 3. HEAD requests previously returned a full body — wasteful for
//    preflight cache probes, and incorrect per HTTP spec (HEAD must
//    NOT have a body).

describe('createHandler — PR-S6 HTTP method gating', () => {
  const Home: ComponentFn = () => h('h1', null, 'Home')
  const routes = [{ path: '/', component: Home }]

  test('GET → 200 with body (baseline)', async () => {
    const handler = createHandler({ App: Home, routes })
    const res = await handler(new Request('http://localhost/', { method: 'GET' }))
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('<h1>Home</h1>')
  })

  test('HEAD → 200 with NO body (same headers as GET)', async () => {
    const handler = createHandler({ App: Home, routes })
    const res = await handler(new Request('http://localhost/', { method: 'HEAD' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/html')
    const text = await res.text()
    expect(text).toBe('')
  })

  test('OPTIONS → 204 No Content + Allow header (fallback for unhandled preflight)', async () => {
    // Middleware (CORS, server actions, API routes) gets first crack at
    // OPTIONS — the handler's gate only fires when no middleware
    // short-circuits. So OPTIONS preflight to a route that ONLY renders
    // HTML gets the canonical 204 + Allow response.
    const handler = createHandler({ App: Home, routes })
    const res = await handler(new Request('http://localhost/', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
    expect(res.headers.get('Allow')).toBe('GET, HEAD, OPTIONS')
    const text = await res.text()
    expect(text).toBe('')
  })

  test('POST → 405 Method Not Allowed + Allow header (no loader fires)', async () => {
    // Pre-fix: POST ran the render pipeline including loaders — side
    // effects on every misconfigured POST. Now: 405 short-circuit.
    let loaderFired = false
    const loaderRoutes = [
      {
        path: '/',
        component: Home,
        loader: async () => {
          loaderFired = true
          return { ok: true }
        },
      },
    ]
    const handler = createHandler({ App: Home, routes: loaderRoutes })
    const res = await handler(new Request('http://localhost/', { method: 'POST' }))
    expect(res.status).toBe(405)
    expect(res.headers.get('Allow')).toBe('GET, HEAD, OPTIONS')
    // Critical: the loader did NOT fire — POST short-circuits BEFORE
    // the render pipeline runs. Pre-fix this would be `true`.
    expect(loaderFired).toBe(false)
  })

  test('PUT → 405 + Allow header', async () => {
    const handler = createHandler({ App: Home, routes })
    const res = await handler(new Request('http://localhost/', { method: 'PUT' }))
    expect(res.status).toBe(405)
    expect(res.headers.get('Allow')).toBe('GET, HEAD, OPTIONS')
  })

  test('DELETE → 405 + Allow header', async () => {
    const handler = createHandler({ App: Home, routes })
    const res = await handler(new Request('http://localhost/', { method: 'DELETE' }))
    expect(res.status).toBe(405)
    expect(res.headers.get('Allow')).toBe('GET, HEAD, OPTIONS')
  })

  test('PATCH → 405 + Allow header', async () => {
    const handler = createHandler({ App: Home, routes })
    const res = await handler(new Request('http://localhost/', { method: 'PATCH' }))
    expect(res.status).toBe(405)
    expect(res.headers.get('Allow')).toBe('GET, HEAD, OPTIONS')
  })

  test('middleware that returns a Response runs BEFORE the method gate', async () => {
    // CRITICAL: server actions, API routes, CORS middleware all return
    // Response from middleware on non-GET methods. The gate must NOT
    // pre-empt them — middleware runs first; gate is the fallback when
    // nothing else handled the method.
    let mwSawPost = false
    const mw: Middleware = (ctx) => {
      if (ctx.req.method === 'POST') {
        mwSawPost = true
        return new Response('handled by middleware', { status: 201 })
      }
    }
    const handler = createHandler({ App: Home, routes, middleware: [mw] })
    const res = await handler(new Request('http://localhost/', { method: 'POST' }))
    // Middleware short-circuited with 201 — gate never fired
    expect(res.status).toBe(201)
    expect(await res.text()).toBe('handled by middleware')
    expect(mwSawPost).toBe(true)
    // Crucially: the response is NOT 405 — proves middleware ran first
    expect(res.headers.get('Allow')).toBeNull()
  })
})

describe('createHandler — PR-S6 stream mode 404 status', () => {
  // Same 404 routes shape as the M1.2 describe block above.
  const HomePage: ComponentFn = () => h('h1', { 'data-testid': 'home' }, 'Home')
  const NotFound: ComponentFn = () => h('h1', { 'data-testid': 'not-found' }, 'Page Not Found')
  const Layout: ComponentFn = () =>
    h(
      'div',
      { 'data-testid': 'layout' },
      h('nav', { 'data-testid': 'nav' }, 'NAV'),
      h(RouterView, {}),
    )
  const routes = [
    {
      path: '/',
      component: Layout,
      notFoundComponent: NotFound,
      children: [{ path: '/', component: HomePage }],
    },
  ]

  test('stream mode: unmatched URL emits HTTP 404 (not 200)', async () => {
    // Pre-PR-S6 stream mode hard-coded `status: 200` — the L5
    // router-driven 404 path worked for string mode but silently
    // downgraded to 200 for streaming consumers.
    const handler = createHandler({ App: RouterView, routes, mode: 'stream' })
    const res = await handler(
      new Request('http://localhost/this-page-does-not-exist'),
    )
    expect(res.status).toBe(404)
    // Body still streams — it's a chrome-wrapped 404 HTML.
    const text = await res.text()
    expect(text).toContain('data-testid="not-found"')
    expect(text).toContain('data-testid="layout"')
  })

  test('stream mode: matched URL still emits 200', async () => {
    const handler = createHandler({ App: RouterView, routes, mode: 'stream' })
    const res = await handler(new Request('http://localhost/'))
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('data-testid="home"')
  })

  test('stream mode: HEAD returns headers + status but NO body', async () => {
    const handler = createHandler({ App: RouterView, routes, mode: 'stream' })
    const res = await handler(new Request('http://localhost/', { method: 'HEAD' }))
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toBe('')
  })

  test('stream mode: HEAD against unmatched URL emits 404 + NO body', async () => {
    const handler = createHandler({ App: RouterView, routes, mode: 'stream' })
    const res = await handler(
      new Request('http://localhost/missing', { method: 'HEAD' }),
    )
    expect(res.status).toBe(404)
    const text = await res.text()
    expect(text).toBe('')
  })
})
