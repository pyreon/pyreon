import { h, pushContext, popContext, useContext } from "@pyreon/core"
import { onUnmount } from "@pyreon/core"
import type { ComponentFn, Props, VNode, VNodeChild } from "@pyreon/core"
import { setActiveRouter, isLazy, RouterContext } from "./router"
import type { Router, RouterInstance, RouteRecord, ResolvedRoute } from "./types"
import { LoaderDataContext, prefetchLoaderData } from "./loader"

// Track prefetched paths per router to avoid duplicate fetches
const _prefetched = new WeakMap<RouterInstance, Set<string>>()

// ─── RouterProvider ───────────────────────────────────────────────────────────

export interface RouterProviderProps extends Props {
  router: Router
  children?: VNode | VNodeChild | null
}

export const RouterProvider: ComponentFn<RouterProviderProps> = (props) => {
  const router = props.router as RouterInstance
  // Push router into the context stack — isolated per request in SSR via ALS,
  // isolated per component tree in CSR.
  const frame = new Map([[RouterContext.id, router]])
  pushContext(frame)
  onUnmount(() => popContext())
  // Also set the module fallback so programmatic useRouter() outside a component
  // tree (e.g. navigation guards in event handlers) still works in CSR.
  setActiveRouter(router)
  return (props.children ?? null) as VNode | null
}

// ─── RouterView ───────────────────────────────────────────────────────────────

export interface RouterViewProps extends Props {
  /** Explicitly pass a router (optional — uses the active router by default) */
  router?: Router
}

/**
 * Renders the matched route component at this nesting level.
 *
 * Nested layouts work by placing a second `<RouterView />` inside the layout
 * component — it automatically renders the next level of the matched route.
 *
 * How depth tracking works:
 * Nova components run once in depth-first tree order. Each `RouterView`
 * captures `router._viewDepth` at setup time and immediately increments it,
 * so sibling and child views get the correct index. `onUnmount` decrements
 * the counter so dynamic route swaps work correctly.
 *
 * @example
 * // Route config:
 * { path: "/admin", component: AdminLayout, children: [
 *   { path: "users", component: AdminUsers },
 * ]}
 *
 * // AdminLayout renders a nested RouterView:
 * function AdminLayout() {
 *   return <div><Sidebar /><RouterView /></div>
 * }
 */
export const RouterView: ComponentFn<RouterViewProps> = (props) => {
  const router = ((props.router as RouterInstance | undefined) ?? useContext(RouterContext)) as RouterInstance | null
  if (!router) return null

  // Claim this view's depth at setup time (depth-first component init order)
  const depth = router._viewDepth
  router._viewDepth++

  onUnmount(() => {
    router._viewDepth--
  })

  const child = (): VNodeChild => {
    router._loadingSignal()  // reactive — re-renders after lazy load completes

    const route = router.currentRoute()

    if (route.matched.length === 0) return null

    // Render the matched record at this view's depth level
    const record = route.matched[depth]
    if (!record) return null  // no component at this nesting level

    const cached = router._componentCache.get(record)
    if (cached) {
      return renderWithLoader(router, record, cached, route)
    }

    const raw = record.component

    if (isLazy(raw)) {
      // Show error UI if all retries have already failed
      if (router._erroredChunks.has(record)) {
        return raw.errorComponent ? h(raw.errorComponent, {}) : null
      }

      const tryLoad = (attempt: number): Promise<void> =>
        raw.loader()
          .then((mod) => {
            const resolved = typeof mod === "function" ? mod : mod.default
            router._componentCache.set(record, resolved)
            router._loadingSignal.update((n) => n + 1)
          })
          .catch((err: unknown) => {
            if (attempt < 3) {
              return new Promise<void>((res) => setTimeout(res, 500 * 2 ** attempt))
                .then(() => tryLoad(attempt + 1))
            }
            // All retries failed — check for stale chunk (post-deploy 404 / parse error)
            if (typeof window !== "undefined" && isStaleChunk(err)) {
              window.location.reload()
              return
            }
            console.error("[nova-router] Chunk failed to load after 3 retries:", err)
            router._erroredChunks.add(record)
            router._loadingSignal.update((n) => n + 1)  // re-render to show error UI
          })

      tryLoad(0)
      return raw.loadingComponent ? h(raw.loadingComponent, {}) : null
    }

    router._componentCache.set(record, raw)
    return renderWithLoader(router, record, raw, route)
  }

  return h("div", { "data-nova-router-view": true }, child as unknown as VNodeChild)
}

// ─── RouterLink ───────────────────────────────────────────────────────────────

export interface RouterLinkProps extends Props {
  to: string
  /** If true, uses router.replace() instead of router.push() */
  replace?: boolean
  /** CSS class applied when this link is active (default: "router-link-active") */
  activeClass?: string
  /** CSS class for exact-match active state (default: "router-link-exact-active") */
  exactActiveClass?: string
  /** If true, only applies activeClass on exact match */
  exact?: boolean
  /**
   * Prefetch strategy for loader data:
   *   - "hover" (default) — prefetch when the user hovers over the link
   *   - "viewport" — prefetch when the link scrolls into the viewport
   *   - "none" — no prefetching
   */
  prefetch?: "hover" | "viewport" | "none"
  children?: VNodeChild | null
}

export const RouterLink: ComponentFn<RouterLinkProps> = (props) => {
  const router = useContext(RouterContext)
  const prefetchMode = props.prefetch ?? "hover"

  const handleClick = (e: MouseEvent) => {
    e.preventDefault()
    if (!router) return
    if (props.replace) {
      router.replace(props.to)
    } else {
      router.push(props.to)
    }
  }

  const handleMouseEnter = () => {
    if (prefetchMode !== "hover" || !router) return
    prefetchRoute(router as RouterInstance, props.to)
  }

  const href = router?.mode === "history" ? props.to : `#${props.to}`

  const activeClass = (): string => {
    if (!router) return ""
    const current = router.currentRoute().path
    const target = props.to
    const isExact = current === target
    const isActive = isExact || (!props.exact && target !== "/" && current.startsWith(`${target}/`))

    const classes: string[] = []
    if (isActive) classes.push(props.activeClass ?? "router-link-active")
    if (isExact) classes.push(props.exactActiveClass ?? "router-link-exact-active")
    return classes.join(" ").trim()
  }

  return h("a", { href, class: activeClass, onClick: handleClick, onMouseEnter: handleMouseEnter }, props.children ?? props.to)
}

/** Prefetch loader data for a route (only once per router + path). */
function prefetchRoute(router: RouterInstance, path: string): void {
  let set = _prefetched.get(router)
  if (!set) {
    set = new Set()
    _prefetched.set(router, set)
  }
  if (set.has(path)) return
  set.add(path)
  prefetchLoaderData(router, path).catch(() => {
    // Silently ignore — prefetch is best-effort
    set?.delete(path)
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Wraps the route component with a LoaderDataProvider so `useLoaderData()` works
 * inside the component. If the record has no loader, renders the component directly.
 */
function renderWithLoader(
  router: RouterInstance,
  record: RouteRecord,
  Comp: ComponentFn,
  route: Pick<ResolvedRoute, "params" | "query" | "meta">,
): VNodeChild {
  const routeProps = { params: route.params, query: route.query, meta: route.meta }
  if (!record.loader) {
    return h(Comp, routeProps)
  }
  const data = router._loaderData.get(record)
  return h(LoaderDataProvider, { data, children: h(Comp, routeProps) })
}

/**
 * Thin provider component that pushes LoaderDataContext before children mount.
 * Uses Nova's context stack so useLoaderData() reads it during child setup.
 */
function LoaderDataProvider(props: { data: unknown; children: VNode | null }): VNode | null {
  const frame = new Map([[LoaderDataContext.id, props.data]])
  pushContext(frame)
  onUnmount(() => popContext())
  return props.children
}

/**
 * Detect a stale chunk error — happens post-deploy when the browser requests
 * a hashed filename that no longer exists on the server. Trigger a full reload
 * so the user gets the new bundle instead of a broken loading state.
 */
function isStaleChunk(err: unknown): boolean {
  if (err instanceof TypeError && String(err.message).includes("Failed to fetch")) return true
  if (err instanceof SyntaxError) return true
  return false
}
