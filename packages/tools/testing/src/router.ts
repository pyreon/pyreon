/**
 * `@pyreon/testing/router` — test helpers for `@pyreon/router`.
 *
 *   await renderWithRouter(<App/>, { routes, route: '/posts/1' })
 *
 * Creates a router pinned to `route`, PRE-RESOLVES the initial navigation
 * (`router.preload` — lazy components into the cache + loaders into the data
 * map, the exact SSR-handler contract), mounts `ui` inside a
 * `<RouterProvider>`, and returns the render result plus the live `router`
 * and a `navigate()` that resolves when the navigation has SETTLED
 * (guards + loaders done, DOM committed).
 *
 * Requires the optional peer `@pyreon/router`.
 */
import type { VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import type { NavigationResult, RouteRecord, Router } from '@pyreon/router'
import { createRouter, RouterProvider, RouterView } from '@pyreon/router'
import type { RenderOptions, RenderResult } from '@pyreon/testing'
import { render } from '@pyreon/testing'

export interface RenderWithRouterOptions extends RenderOptions {
  /** Route table for the test router. Ignored when `router` is passed. */
  routes?: RouteRecord[]
  /** Initial route the router starts (and settles) at. Default `'/'`. */
  route?: string
  /** History mode. Default `'hash'` (side-effect-light in test DOMs). */
  mode?: 'hash' | 'history'
  /** Bring your own router (created via `createRouter`) instead of `routes`. */
  router?: Router
  /** Compose an OUTER wrapper around the provider tree (e.g. a theme provider). */
  wrapper?: (children: VNodeChild) => VNodeChild
}

export type RenderWithRouterResult = RenderResult & {
  /** The live router — guards, currentRoute(), everything. */
  router: Router
  /** Navigate + settle: resolves AFTER guards/loaders ran and the DOM committed. */
  navigate: (path: string) => Promise<NavigationResult>
}

/**
 * Mount `ui` under a test router, settled at `route`.
 *
 * ASYNC — the initial route's lazy components AND loaders are resolved before
 * mount (so `useLoaderData()` is populated on first render, like SSR), hence
 * the `await`.
 *
 * Pass `null` as `ui` to mount a bare `<RouterView/>` (pure route-table
 * tests). Unmounting destroys the router (RouterProvider's own contract).
 *
 * @example
 *   const { router, navigate, getByText } = await renderWithRouter(null, {
 *     routes: [{ path: '/posts/:id', component: Post, loader: fetchPost }],
 *     route: '/posts/1',
 *   })
 *   expectRouter(router).toBeAt('/posts/:id')
 *   await navigate('/posts/2')
 */
export async function renderWithRouter(
  ui: VNodeChild | null,
  options: RenderWithRouterOptions,
): Promise<RenderWithRouterResult> {
  const { routes, route = '/', mode, router: givenRouter, wrapper, ...renderOptions } = options
  if (givenRouter === undefined && routes === undefined) {
    throw new Error('[Pyreon] renderWithRouter: pass `routes` (or a pre-built `router`).')
  }
  const router =
    givenRouter ?? createRouter({ routes: routes as RouteRecord[], url: route, ...(mode ? { mode } : {}) })

  // The SSR-handler contract: resolve lazy components into the cache AND run
  // the matched chain's loaders BEFORE the synchronous mount — so the first
  // render shows final content (no loading fallbacks, `useLoaderData()`
  // populated). See CLAUDE.md "The SSR handler must pre-resolve lazy route
  // components BEFORE rendering".
  await router.preload(route)

  const tree = h(RouterProvider, { router }, ui ?? h(RouterView, {}))
  const result = render(wrapper ? wrapper(tree) : tree, renderOptions)

  return {
    ...result,
    router,
    navigate: (path: string) => router.push(path),
  }
}

// ─── expectRouter ───────────────────────────────────────────────────────────

export interface RouterAssertions {
  /**
   * Assert the router's current route. `expected` matches either the CONCRETE
   * path (`'/posts/1'`) or any matched record's PATTERN (`'/posts/:id'`).
   */
  toBeAt(expected: string): void
  /** Negative form of `toBeAt`. */
  notToBeAt(expected: string): void
}

/**
 * Fluent assertions over a router's current route (same convention as
 * `expectSignal` / `expectForm`).
 *
 * @example
 *   expectRouter(router).toBeAt('/posts/:id')  // pattern form
 *   expectRouter(router).toBeAt('/posts/1')    // concrete form
 */
export function expectRouter(router: Router): RouterAssertions {
  const isAt = (expected: string): boolean => {
    const current = router.currentRoute()
    if (current.path === expected) return true
    return current.matched.some((record) => record.path === expected)
  }
  const describe = (): string => {
    const current = router.currentRoute()
    const patterns = current.matched.map((r) => r.path).join(' → ')
    return `path "${current.path}"${patterns ? ` (matched: ${patterns})` : ' (no route matched)'}`
  }
  return {
    toBeAt(expected) {
      if (!isAt(expected)) {
        throw new Error(`[Pyreon] expectRouter: expected router to be at "${expected}", but it is at ${describe()}`)
      }
    },
    notToBeAt(expected) {
      if (isAt(expected)) {
        throw new Error(`[Pyreon] expectRouter: expected router NOT to be at "${expected}", but it is (${describe()})`)
      }
    },
  }
}
