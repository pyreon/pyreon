// @vitest-environment node
/**
 * `renderPage` — the shared string-mode page-render pipeline (Phase 1 of the
 * render-modes plan). These specs lock the contract all three consumers
 * (production handler, zero SSG entry, zero dev SSR middleware) rely on:
 * result kinds, redirect catching, skipLoaders, styler-tag handling,
 * request-locals bridging, 404 status via the notFoundComponent chain, and
 * routeModules extraction.
 */
import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import { createRouter, lazy, redirect, RouterView, useLoaderData } from '@pyreon/router'
import { useRequestLocals } from '../middleware'
import { renderPage } from '../render-page'

const Page: ComponentFn = () => h('main', { id: 'page' }, 'Hello')

// Consumers' contract (handler / SSG entry / dev middleware all hold it):
// the router is a PER-REQUEST instance created AT the target path —
// `preload` warms lazy components + loaders but does not navigate. Tests
// mirror that by creating the router at the path under test.
function makeRouter(routes: import('@pyreon/router').RouteRecord[], url: string) {
  return createRouter({ routes, mode: 'history', url })
}

describe('renderPage — html kind', () => {
  test('renders app + head, status 200, empty loaderScript without loader data', async () => {
    const router = makeRouter([{ path: '/', component: Page }], '/')
    const result = await renderPage(
      () => h(RouterView, null),
      router as never,
      '/',
    )
    expect(result.kind).toBe('html')
    if (result.kind !== 'html') return
    expect(result.appHtml).toContain('<main id="page">Hello</main>')
    expect(result.status).toBe(200)
    expect(result.loaderScript).toBe('')
    expect(result.routeModules).toEqual([])
  })

  test('serializes loader data into the inline script', async () => {
    const Posts: ComponentFn = () => {
      const data = useLoaderData<{ posts: string[] }>()
      return h('ul', null, data?.posts.join(','))
    }
    const router = makeRouter([
      { path: '/posts', component: Posts, loader: async () => ({ posts: ['a', 'b'] }) },
    ], '/posts')
    const result = await renderPage(() => h(RouterView, null), router as never, '/posts')
    expect(result.kind).toBe('html')
    if (result.kind !== 'html') return
    expect(result.appHtml).toContain('a,b')
    expect(result.loaderScript).toContain('window.__PYREON_LOADER_DATA__=')
    expect(result.loaderScript).toContain('"posts"')
  })

  test('skipLoaders resolves components but does NOT run loaders', async () => {
    let loaderRan = 0
    const router = makeRouter([
      {
        path: '/x',
        component: Page,
        loader: async () => {
          loaderRan++
          return { v: 1 }
        },
      },
    ], '/x')
    const result = await renderPage(() => h(RouterView, null), router as never, '/x', {
      skipLoaders: true,
    })
    expect(result.kind).toBe('html')
    expect(loaderRan).toBe(0)
    if (result.kind === 'html') expect(result.loaderScript).toBe('')
  })
})

describe('renderPage — redirect kind', () => {
  test('a loader-thrown redirect() comes back as kind=redirect BEFORE any render', async () => {
    let rendered = 0
    const Spy: ComponentFn = () => {
      rendered++
      return h('div', null, 'secret')
    }
    const router = makeRouter([
      {
        path: '/admin',
        component: Spy,
        loader: async () => {
          redirect('/login')
        },
      },
    ], '/admin')
    const result = await renderPage(() => h(RouterView, null), router as never, '/admin')
    expect(result).toEqual({ kind: 'redirect', from: '/admin', to: '/login', status: 307 })
    expect(rendered).toBe(0) // auth-gated layout never leaked
  })

  test('custom redirect status is preserved', async () => {
    const router = makeRouter([
      {
        path: '/old',
        component: Page,
        loader: async () => {
          redirect('/new', 308)
        },
      },
    ], '/old')
    const result = await renderPage(() => h(RouterView, null), router as never, '/old')
    expect(result.kind).toBe('redirect')
    if (result.kind === 'redirect') expect(result.status).toBe(308)
  })

  test('a non-redirect loader throw RETHROWS to the caller', async () => {
    const router = makeRouter([
      {
        path: '/boom',
        component: Page,
        loader: async () => {
          throw new Error('loader exploded')
        },
      },
    ], '/boom')
    await expect(
      renderPage(() => h(RouterView, null), router as never, '/boom'),
    ).rejects.toThrow('loader exploded')
  })
})

describe('renderPage — unmatched', () => {
  test('bailOnUnmatched returns kind=unmatched for an unroutable path', async () => {
    const router = makeRouter([{ path: '/', component: Page }], '/nope')
    const result = await renderPage(() => h(RouterView, null), router as never, '/nope', {
      bailOnUnmatched: true,
    })
    expect(result).toEqual({ kind: 'unmatched' })
  })

  test('default (no bail) renders through an empty match', async () => {
    const router = makeRouter([{ path: '/', component: Page }], '/nope')
    const result = await renderPage(() => h(RouterView, null), router as never, '/nope')
    expect(result.kind).toBe('html')
  })

  test('notFoundComponent chain renders with status 404', async () => {
    const NotFound: ComponentFn = () => h('h1', null, 'not found')
    const Layout: ComponentFn = () => h('div', { id: 'chrome' }, h(RouterView, null))
    const router = makeRouter([
      {
        path: '/',
        component: Layout,
        notFoundComponent: NotFound,
        children: [{ path: '/', component: Page }],
      },
    ], '/missing')
    const result = await renderPage(() => h(RouterView, null), router as never, '/missing')
    expect(result.kind).toBe('html')
    if (result.kind !== 'html') return
    expect(result.status).toBe(404)
    expect(result.appHtml).toContain('not found')
    expect(result.appHtml).toContain('id="chrome"') // layout chrome wraps (L5)
  })
})

describe('renderPage — styles + locals + routeModules', () => {
  test('a populated style tag is prepended to the head; an empty one is skipped', async () => {
    const router = makeRouter([{ path: '/', component: Page }], '/')
    const populated = await renderPage(() => h(RouterView, null), router as never, '/', {
      collectStyles: () => '<style data-x="1">.a{color:red}</style>',
    })
    expect(populated.kind).toBe('html')
    if (populated.kind === 'html') {
      expect(populated.head.startsWith('<style data-x="1">')).toBe(true)
    }

    const router2 = makeRouter([{ path: '/', component: Page }], '/')
    const empty = await renderPage(() => h(RouterView, null), router2 as never, '/', {
      collectStyles: () => '<style data-x="1"></style>',
    })
    expect(empty.kind).toBe('html')
    if (empty.kind === 'html') {
      expect(empty.head).not.toContain('<style')
    }
  })

  test('locals are readable via useRequestLocals during the render', async () => {
    const LocalsReader: ComponentFn = () => {
      const locals = useRequestLocals() as { nonce?: string }
      return h('span', null, `nonce:${locals.nonce ?? 'none'}`)
    }
    const router = makeRouter([{ path: '/', component: LocalsReader }], '/')
    const result = await renderPage(() => h(RouterView, null), router as never, '/', {
      locals: { nonce: 'abc123' },
    })
    expect(result.kind).toBe('html')
    if (result.kind === 'html') expect(result.appHtml).toContain('nonce:abc123')
  })

  test('routeModules surfaces lazy components’ _hmrId for modulepreload mapping', async () => {
    const lazyPage = lazy(async () => Page, { hmrId: '/src/routes/index.tsx' })
    const router = makeRouter([{ path: '/', component: lazyPage }], '/')
    const result = await renderPage(() => h(RouterView, null), router as never, '/')
    expect(result.kind).toBe('html')
    if (result.kind === 'html') {
      expect(result.routeModules).toEqual(['/src/routes/index.tsx'])
    }
  })
})

describe('renderPage — CSP nonce threading', () => {
  test('loader-data script carries the request nonce from locals.cspNonce', async () => {
    const router = makeRouter(
      [{ path: '/', component: Page, loader: async () => ({ x: 1 }) }],
      '/',
    )
    const result = await renderPage(() => h(RouterView, null), router as never, '/', {
      locals: { cspNonce: 'nonceXYZ' },
    })
    expect(result.kind).toBe('html')
    if (result.kind !== 'html') return
    expect(result.loaderScript).toContain(
      '<script nonce="nonceXYZ">window.__PYREON_LOADER_DATA__=',
    )
  })

  test('collectStyles receives the nonce; the styler <style> lands in head with it', async () => {
    const router = makeRouter([{ path: '/', component: Page }], '/')
    let received: string | undefined = 'UNSET'
    const result = await renderPage(() => h(RouterView, null), router as never, '/', {
      locals: { cspNonce: 'nonceXYZ' },
      collectStyles: (nonce) => {
        received = nonce
        return `<style data-x nonce="${nonce}">.a{color:red}</style>`
      },
    })
    expect(received).toBe('nonceXYZ')
    expect(result.kind).toBe('html')
    if (result.kind === 'html') {
      expect(result.head).toContain('<style data-x nonce="nonceXYZ">')
    }
  })

  test('no cspNonce → no nonce attribute anywhere (byte-identical to before)', async () => {
    const router = makeRouter(
      [{ path: '/', component: Page, loader: async () => ({ x: 1 }) }],
      '/',
    )
    let received: string | undefined = 'UNSET'
    const result = await renderPage(() => h(RouterView, null), router as never, '/', {
      collectStyles: (nonce) => {
        received = nonce
        return '<style data-x="1">.a{color:red}</style>'
      },
    })
    expect(received).toBeUndefined()
    expect(result.kind).toBe('html')
    if (result.kind !== 'html') return
    expect(result.loaderScript).toContain('<script>window.__PYREON_LOADER_DATA__=')
    expect(result.loaderScript).not.toContain('nonce=')
  })

  test('a nonce with dangerous chars is sanitized to a bare token', async () => {
    const router = makeRouter(
      [{ path: '/', component: Page, loader: async () => ({ x: 1 }) }],
      '/',
    )
    const result = await renderPage(() => h(RouterView, null), router as never, '/', {
      locals: { cspNonce: 'ab"c> <\'x' },
    })
    expect(result.kind).toBe('html')
    if (result.kind !== 'html') return
    expect(result.loaderScript).toContain('<script nonce="abcx">')
  })
})
