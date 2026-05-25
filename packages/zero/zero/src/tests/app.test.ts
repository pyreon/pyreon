import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import type { RouteRecord } from '@pyreon/router'
import { RouterView } from '@pyreon/router'
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
    const html = await renderToString(h(App, null))

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
