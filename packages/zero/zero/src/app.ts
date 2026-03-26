import type { ComponentFn, Props } from "@pyreon/core"
import { Fragment, h } from "@pyreon/core"
import { HeadProvider } from "@pyreon/head"
import type { RouteRecord } from "@pyreon/router"
import { createRouter, RouterProvider, RouterView } from "@pyreon/router"

// ─── App assembly ────────────────────────────────────────────────────────────

export interface CreateAppOptions {
  /** Route definitions (from file-based routing or manual). */
  routes: RouteRecord[]

  /** Router mode. Default: "history" for SSR, "hash" for SPA. */
  routerMode?: "hash" | "history"

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
    mode: options.routerMode ?? "history",
    ...(options.url ? { url: options.url } : {}),
    scrollBehavior: "top",
  })

  const Layout = options.layout ?? DefaultLayout

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
