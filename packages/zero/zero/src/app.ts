import type { ComponentFn, Props } from '@pyreon/core'
import { Fragment, h } from '@pyreon/core'
import { HeadProvider } from '@pyreon/head'
import type { RouteRecord } from '@pyreon/router'
import { createRouter, RouterProvider, RouterView } from '@pyreon/router'

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

  function App() {
    return h(
      HeadProvider,
      null,
      h(
        RouterProvider as ComponentFn<Props>,
        { router },
        h(Layout, null, h(RouterView as ComponentFn<Props>, null)),
      ),
    )
  }

  return { App, router }
}

function DefaultLayout(props: Props) {
  return h(Fragment, null, ...(Array.isArray(props.children) ? props.children : [props.children]))
}
