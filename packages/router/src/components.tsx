import type { ComponentFn, Props, VNode, VNodeChild } from "@pyreon/core"
import { createRef, h, onUnmount, popContext, pushContext, useContext } from "@pyreon/core"
import { LoaderDataContext, prefetchLoaderData } from "./loader"
import { isLazy, RouterContext, setActiveRouter } from "./router"
import type { LazyComponent, ResolvedRoute, RouteRecord, Router, RouterInstance } from "./types"

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
  onUnmount(() => {
    popContext()
    // Clean up event listeners, caches, abort in-flight navigations.
    // Safe to call multiple times (destroy is idempotent).
    router.destroy()
    setActiveRouter(null)
  })
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
 * Pyreon components run once in depth-first tree order. Each `RouterView`
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
  const router = ((props.router as RouterInstance | undefined) ??
    useContext(RouterContext)) as RouterInstance | null
  if (!router) return null

  // Claim this view's depth at setup time (depth-first component init order)
  const depth = router._viewDepth
  router._viewDepth++

  onUnmount(() => {
    router._viewDepth--
  })

  const child = (): VNodeChild => {
    router._loadingSignal() // reactive — re-renders after lazy load completes

    const route = router.currentRoute()

    if (route.matched.length === 0) return null

    // Render the matched record at this view's depth level
    const record = route.matched[depth]
    if (!record) return null // no component at this nesting level

    const cached = router._componentCache.get(record)
    if (cached) {
      return renderWithLoader(router, record, cached, route)
    }

    const raw = record.component

    if (!isLazy(raw)) {
      cacheSet(router, record, raw)
      return renderWithLoader(router, record, raw, route)
    }

    return renderLazyRoute(router, record, raw)
  }

  return h("div", { "data-pyreon-router-view": true }, child as unknown as VNodeChild)
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

  const inst = router as RouterInstance | null
  const href = inst?.mode === "history" ? `${inst._base}${props.to}` : `#${props.to}`

  const activeClass = (): string => {
    if (!router) return ""
    const current = router.currentRoute().path
    const target = props.to
    const isExact = current === target
    const isActive = isExact || (!props.exact && isSegmentPrefix(current, target))

    const classes: string[] = []
    if (isActive) classes.push(props.activeClass ?? "router-link-active")
    if (isExact) classes.push(props.exactActiveClass ?? "router-link-exact-active")
    return classes.join(" ").trim()
  }

  // Viewport prefetching — observe link visibility with IntersectionObserver
  const ref = createRef<Element>()
  if (prefetchMode === "viewport" && router && typeof IntersectionObserver !== "undefined") {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          prefetchRoute(router as RouterInstance, props.to)
          observer.disconnect()
          break
        }
      }
    })
    // Observe after mount — the ref will be populated once the element is in the DOM
    queueMicrotask(() => {
      observer.observe(ref.current as Element)
    })
    onUnmount(() => observer.disconnect())
  }

  return h(
    "a",
    { ref, href, class: activeClass, onClick: handleClick, onMouseEnter: handleMouseEnter },
    props.children ?? props.to,
  )
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

function renderLazyRoute(
  router: RouterInstance,
  record: RouteRecord,
  raw: LazyComponent,
): VNodeChild {
  if (router._erroredChunks.has(record)) {
    return raw.errorComponent ? h(raw.errorComponent, {}) : null
  }

  const tryLoad = (attempt: number): Promise<void> =>
    raw
      .loader()
      .then((mod) => {
        const resolved = typeof mod === "function" ? mod : mod.default
        cacheSet(router, record, resolved)
        router._loadingSignal.update((n) => n + 1)
      })
      .catch((err: unknown) => {
        if (attempt < 3) {
          return new Promise<void>((res) => setTimeout(res, 500 * 2 ** attempt)).then(() =>
            tryLoad(attempt + 1),
          )
        }
        if (typeof window !== "undefined" && isStaleChunk(err)) {
          window.location.reload()
          return
        }

        router._erroredChunks.add(record)
        router._loadingSignal.update((n) => n + 1)
      })

  tryLoad(0)
  return raw.loadingComponent ? h(raw.loadingComponent, {}) : null
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
  // If loader data is undefined and route has an errorComponent, render it
  if (data === undefined && record.errorComponent) {
    return h(record.errorComponent, routeProps)
  }
  return h(LoaderDataProvider, { data, children: h(Comp, routeProps) })
}

/**
 * Thin provider component that pushes LoaderDataContext before children mount.
 * Uses Pyreon's context stack so useLoaderData() reads it during child setup.
 */
function LoaderDataProvider(props: { data: unknown; children: VNode | null }): VNode | null {
  const frame = new Map([[LoaderDataContext.id, props.data]])
  pushContext(frame)
  onUnmount(() => popContext())
  return props.children
}

/** Evict oldest cache entries when the component cache exceeds maxCacheSize. */
function cacheSet(router: RouterInstance, record: RouteRecord, comp: ComponentFn): void {
  router._componentCache.set(record, comp)
  if (router._componentCache.size > router._maxCacheSize) {
    // Map iterates in insertion order — first key is oldest
    const oldest = router._componentCache.keys().next().value as RouteRecord
    router._componentCache.delete(oldest)
  }
}

/**
 * Segment-aware prefix check for active link matching.
 * `/admin` is a prefix of `/admin/users` but NOT of `/admin-panel`.
 */
function isSegmentPrefix(current: string, target: string): boolean {
  if (target === "/") return false
  const cs = current.split("/").filter(Boolean)
  const ts = target.split("/").filter(Boolean)
  if (ts.length > cs.length) return false
  return ts.every((seg, i) => seg === cs[i])
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
