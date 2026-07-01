import type { ComponentFn, Props } from '@pyreon/core'
import { Fragment, h } from '@pyreon/core'
import { HeadProvider } from '@pyreon/head'
import type { LinkConfig, RouteRecord } from '@pyreon/router'
import { createRouter, RouterView } from '@pyreon/router'

// ─── App assembly ────────────────────────────────────────────────────────────

export interface CreateAppOptions {
  /** Route definitions (from file-based routing or manual). */
  routes: RouteRecord[]

  /** Router mode. Default: "history" for SSR, "hash" for SPA. */
  routerMode?: 'hash' | 'history'

  /** Initial URL for SSR. */
  url?: string

  /** Root layout component wrapping all routes. */
  layout?: ComponentFn

  /** Global error component. */
  errorComponent?: ComponentFn

  /**
   * Base URL prefix for the deployed app (e.g. `/blog/`). Forwarded to
   * `createRouter({ base })` so RouterLinks render correctly prefixed
   * hrefs (`<a href="/blog/about">` instead of `<a href="/about">`) and
   * the router strips the prefix from incoming URLs before matching.
   *
   * Default: `'/'`. Pre-fix this was disconnected from `zero({ base })`
   * — RouterLinks rendered un-prefixed hrefs even when Vite's asset URL
   * rewriting was correctly using the prefix, causing client-side
   * navigation to break against subpath deploys.
   */
  base?: string

  /**
   * `<Link>` external-link behaviour — `sameOriginAbsolute` (`'internal'` |
   * `'external'`), `externalNewTab`, `externalRel`. Forwarded to
   * `createRouter({ links })`; read by `<Link>` / `useLink`.
   */
  links?: LinkConfig
}

/**
 * Create a full Zero app — assembles router, head provider, and root layout.
 *
 * Used internally by entry-server and entry-client.
 */
export function createApp(options: CreateAppOptions) {
  const router = createRouter({
    routes: options.routes,
    mode: options.routerMode ?? 'history',
    ...(options.url ? { url: options.url } : {}),
    ...(options.base && options.base !== '/' ? { base: options.base } : {}),
    ...(options.links ? { links: options.links } : {}),
    scrollBehavior: 'top',
  })

  // Detect the "double layout" footgun. fs-router emits `_layout.tsx` as a
  // parent route record (the canonical Pyreon way to register a layout via
  // file-system routing). If the user ALSO passes `options.layout` referring
  // to the same component, the layout mounts twice — once via App's wrapper
  // and once via the matched route chain. Result on hydration mismatch:
  // 3× `nav.sidebar` + 3× `main.content`.
  //
  // Defense: when `options.layout` references the same component as ANY
  // top-level route's `component`, drop the explicit option (the route-chain
  // path is canonical) and warn in dev. Anyone who genuinely wants two
  // layout wrappers can compose them inside a single component themselves.
  const hasLayoutInRoutes =
    options.layout !== undefined &&
    options.routes.some((r) => r.component === options.layout)
  if (hasLayoutInRoutes && process.env.NODE_ENV !== 'production') {
    // oxlint-disable-next-line no-console
    console.warn(
      '[Pyreon] `createApp({ layout })` was passed a component that is ALSO a parent route in the matched chain (likely an fs-router `_layout.tsx`). The explicit `layout` option is being ignored to prevent double-mount. Remove the `layout` argument from `createApp`/`startClient` — the fs-router-emitted route handles it.',
    )
  }
  const Layout = hasLayoutInRoutes ? DefaultLayout : (options.layout ?? DefaultLayout)

  // App is router-AGNOSTIC. The RouterProvider lives at the CALL SITE
  // (createHandler in production SSR, renderSsr in dev, renderPath in SSG)
  // because the router is per-request. Wrapping it inside App would close
  // over the build-time `router` (created above at module-init in
  // `entry-server.ts:createServer`'s one-shot `createApp` call); the
  // outer per-request RouterProvider from `createHandler` would then
  // be SHADOWED by App's inner one, and `useContext(RouterContext)`
  // inside `RouterView` / `useLoaderData()` would always read the
  // build-time router. Symptoms in production:
  //   - SSR HTML ships with empty loader sections (loaders write to
  //     the per-request router; readers see the build-time router)
  //   - Concurrent requests cross-contaminate via the shared build-time
  //     `_loaderData` Map (Map persists across the closure's lifetime)
  // Dev `renderSsr` (vite-plugin.ts) and SSG `renderPath` (ssg-plugin.ts)
  // mask the bug by calling `createApp` PER REQUEST — the build-time
  // router is fresh each time. Production `createServer` calls
  // `createApp` ONCE at module init, so the bug is production-only.
  // Fix: drop the inner RouterProvider; every caller supplies its own.
  function App() {
    return h(
      HeadProvider,
      null,
      h(Layout, null, h(RouterView as ComponentFn<Props>, null)),
    )
  }

  return { App, router }
}

function DefaultLayout(props: Props) {
  return h(Fragment, null, ...(Array.isArray(props.children) ? props.children : [props.children]))
}
