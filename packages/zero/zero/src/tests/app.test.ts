import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import type { RouteRecord } from '@pyreon/router'
import { createRouter, RouterProvider, RouterView } from '@pyreon/router'
import { renderToString } from '@pyreon/runtime-server'
import { accessInternal } from '@pyreon/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'

// Regression for the "double layout" footgun. The fs-router emits `_layout.tsx`
// as a parent route (canonical Pyreon layout pattern). If the user ALSO passes
// the same component as `options.layout` to `createApp`/`startClient`, the
// layout mounts twice — once via App's wrapper and once via the matched route
// chain. End-to-end this produced 3× `nav.sidebar` + 3× `main.content` after
// hydration mismatch on the fundamentals layout.
//
// Defense: `createApp` detects when `options.layout` matches any top-level
// route's component and IGNORES the explicit option (warns in dev). The
// route-chain path is canonical — anyone wanting two layout wrappers can
// compose them inside a single component.

describe('createApp — double-layout defense', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warnSpy.mockRestore()
  })

  const Page: ComponentFn = () => h('span', { id: 'page' }, 'page')
  // Mirrors `_layout.tsx` shape: ignores `props.children` and renders its own
  // `<RouterView />` for the next chain entry. The marker text inside the
  // wrapper lets us count layout invocations.
  const Layout: ComponentFn = () =>
    h('div', { class: 'app' }, 'layout-wrapper', h(RouterView, null))

  it('renders the layout EXACTLY ONCE when `options.layout` matches a top-level route component (fs-router shape)', async () => {
    const routes: RouteRecord[] = [
      // Shape emitted by fs-router for `_layout.tsx` + `index.tsx`:
      {
        path: '/',
        component: Layout,
        children: [{ path: '/', component: Page }],
      },
    ]

    const { App } = createApp({ routes, layout: Layout, url: '/' })
    // PR-S1: App is now router-AGNOSTIC. The RouterProvider lives at the
    // call site (createHandler / dev renderSsr / SSG renderPath in prod;
    // the test mirrors that contract here).
    const router = createRouter({ routes, mode: 'history', url: '/' })
    const html = await renderToString(
      h(RouterProvider, { router }, h(App, null)),
    )

    // Layout body string appears exactly once. Pre-fix this rendered 2× nested.
    const occurrences = (html.match(/layout-wrapper/g) ?? []).length
    expect(occurrences).toBe(1)
  })

  it('warns in dev when `options.layout` collides with a top-level route', () => {
    const routes: RouteRecord[] = [
      { path: '/', component: Layout, children: [{ path: '/', component: Page }] },
    ]

    createApp({ routes, layout: Layout, url: '/' })

    const warnings = warnSpy.mock.calls.flat().filter((c): c is string => typeof c === 'string')
    const matches = warnings.some(
      (s) => s.includes('[Pyreon]') && s.includes('double-mount'),
    )
    expect(matches).toBe(true)
  })

  it('does NOT warn when `options.layout` is a distinct component', () => {
    const Distinct: ComponentFn = () => h('div', null, 'distinct')
    const routes: RouteRecord[] = [
      { path: '/', component: Page },
    ]

    createApp({ routes, layout: Distinct, url: '/' })

    const warnings = warnSpy.mock.calls.flat().filter((c): c is string => typeof c === 'string')
    const matches = warnings.some((s) => s.includes('double-mount'))
    expect(matches).toBe(false)
  })

  it('does NOT warn when no `options.layout` is passed', () => {
    const routes: RouteRecord[] = [
      { path: '/', component: Layout, children: [{ path: '/', component: Page }] },
    ]

    createApp({ routes, url: '/' })

    const warnings = warnSpy.mock.calls.flat().filter((c): c is string => typeof c === 'string')
    const matches = warnings.some((s) => s.includes('double-mount'))
    expect(matches).toBe(false)
  })
})

// PR E — subpath / base-path wiring. `zero({ base: '/blog/' })` must
// reach createRouter via createApp's `base` option so RouterLink hrefs
// render with the prefix. Pre-PR-E this surface was disconnected: the
// `base` option didn't exist on CreateAppOptions, and the router defaulted
// to `'/'` regardless of the user's zero config.
describe('createApp — base option (PR E)', () => {
  const Page: ComponentFn = () =>
    h('span', { 'data-testid': 'home', id: 'page' }, 'page')

  it('forwards `base` to createRouter so RouterLink hrefs are prefixed', () => {
    // Use the router exposed by createApp to verify the base reached
    // through. RouterLink rendering is downstream — if the router has
    // the right base, links get the prefix.
    //
    // Router's `normalizeBase('/blog/')` strips the trailing slash and
    // stores `/blog` internally. That's the value we verify here; the
    // verify-modes cell verifies the rendered href has the trailing
    // slash where it belongs (`/blog/about`).
    const routes: RouteRecord[] = [{ path: '/', component: Page }]
    const { router } = createApp({ routes, base: '/blog/', url: '/' })

    const internalBase = accessInternal<{ _base?: string }>(router)._base
    expect(internalBase).toBe('/blog')
  })

  it('passes through nested base correctly', () => {
    const routes: RouteRecord[] = [{ path: '/', component: Page }]
    const { router } = createApp({ routes, base: '/foo/bar/', url: '/' })
    const internalBase = accessInternal<{ _base?: string }>(router)._base
    expect(internalBase).toBe('/foo/bar')
  })

  it('omits the option when base is `/` (default)', () => {
    // `/` is the no-prefix case — passing it through would still work,
    // but the conditional in createApp keeps the createRouter call clean.
    // Verifies the conditional spread doesn't accidentally always pass.
    const routes: RouteRecord[] = [{ path: '/', component: Page }]
    const { router } = createApp({ routes, base: '/', url: '/' })
    const internalBase = accessInternal<{ _base?: string }>(router)._base
    // Router stores empty string when no base — that's the no-prefix sentinel.
    expect(internalBase).toBe('')
  })

  it('omits the option when base is undefined', () => {
    const routes: RouteRecord[] = [{ path: '/', component: Page }]
    const { router } = createApp({ routes, url: '/' })
    const internalBase = accessInternal<{ _base?: string }>(router)._base
    expect(internalBase).toBe('')
  })
})

// ─── PR-S1: RouterProvider unwrap regression ────────────────────────────────
//
// Locks in the contract: App is router-AGNOSTIC; the per-request RouterProvider
// lives at the call site (createHandler in production SSR, dev renderSsr,
// SSG renderPath). Pre-fix `createApp` returned an App that internally wrapped
// itself in `<RouterProvider router={buildTimeRouter}>`. `createHandler` then
// wrapped again with a per-request RouterProvider — but `useContext` picks the
// innermost frame, so `useLoaderData()` always read the build-time router.
//
// Production symptoms:
//   - SSR HTML ships with empty loader sections (loaders wrote to the
//     per-request router; readers saw the build-time router)
//   - Concurrent requests cross-contaminate via the shared build-time
//     `_loaderData` Map
//
// Why this bug shipped: existing tests pass a bare component to createHandler
// (bypassing createApp). Dev `renderSsr` calls createApp PER request (masks).
// SSG `renderPath` calls createApp PER path (masks). Only the production
// `createServer` path — which calls createApp ONCE at module init — exposed
// the bug.
//
// The two tests below exercise the previously-untested production shape:
// `createApp() → createHandler({ App }) → request with loader` AND
// concurrent requests with different loader inputs.
//
// Bisect-verify: revert app.ts:75-85 to re-wrap RouterProvider inside App →
// both tests fail (loader data absent from HTML for test 1; cross-contamination
// in test 2).
describe('createApp — PR-S1 RouterProvider unwrap regression', () => {
  it('loader data reaches RouterView in production SSR via createApp→createHandler', async () => {
    const { useLoaderData } = await import('@pyreon/router')
    const { createHandler } = await import('@pyreon/server')

    const DataView: ComponentFn = () => {
      const data = useLoaderData<{ value: string }>()
      return h('div', { id: 'loaded' }, `value:${data?.value ?? 'MISSING'}`)
    }

    const routes: RouteRecord[] = [
      { path: '/', component: DataView, loader: async () => ({ value: 'loader-output' }) },
    ]

    const { App } = createApp({ routes, url: '/' })
    const handler = createHandler({ App, routes })
    const res = await handler(new Request('http://localhost/'))
    const html = await res.text()

    // Pre-fix: html contained `value:MISSING` (useLoaderData read build-time
    // router's empty _loaderData). Post-fix: contains `value:loader-output`.
    expect(html).toContain('value:loader-output')
    expect(html).not.toContain('value:MISSING')
  })

  it('concurrent requests with different loaders do NOT cross-contaminate', async () => {
    const { useLoaderData } = await import('@pyreon/router')
    const { createHandler } = await import('@pyreon/server')

    const ParamView: ComponentFn = () => {
      const data = useLoaderData<{ who: string }>()
      return h('div', { id: 'who' }, `who:${data?.who ?? 'MISSING'}`)
    }

    const routes: RouteRecord[] = [
      {
        path: '/hello/:name',
        component: ParamView,
        loader: async ({ params }) => ({ who: params.name }),
      },
    ]

    // Single createApp call (matches production createServer's once-at-init shape)
    const { App } = createApp({ routes, url: '/' })
    const handler = createHandler({ App, routes })

    // Two concurrent requests with different params. Pre-fix the build-time
    // router's _loaderData Map accumulated writes across requests — second
    // request could see first request's data.
    const [r1, r2] = await Promise.all([
      handler(new Request('http://localhost/hello/alice')),
      handler(new Request('http://localhost/hello/bob')),
    ])
    const [h1, h2] = await Promise.all([r1.text(), r2.text()])

    expect(h1).toContain('who:alice')
    expect(h1).not.toContain('who:bob')
    expect(h2).toContain('who:bob')
    expect(h2).not.toContain('who:alice')
  })
})
