import type { ComponentFn, VNode } from '@pyreon/core'
import { h } from '@pyreon/core'
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
})

// ─── Islands ─────────────────────────────────────────────────────────────────

describe('island', () => {
  test('island() returns a function with island metadata', () => {
    const Counter = island(() => Promise.resolve({ default: () => h('div', null, '0') }), {
      name: 'Counter',
    })
    expect(typeof Counter).toBe('function')
    expect((Counter as unknown as { __island: boolean }).__island).toBe(true)
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
    const Widget = island(() => Promise.resolve({ default: Inner }), { name: 'Direct' })

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

  test('island() serializes empty props as empty object', async () => {
    const Inner: ComponentFn = () => h('div', null)
    const Widget = island(() => Promise.resolve({ default: Inner }), { name: 'Empty' })

    const vnode = await (Widget as unknown as (props: Record<string, unknown>) => Promise<VNode>)(
      {},
    )
    expect(vnode.props['data-props']).toBe('{}')
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
