import { computed, signal } from "@pyreon/reactivity"
import { createContext, useContext } from "@pyreon/core"
import {
  type AfterEachHook,
  type LoaderContext,
  type NavigationGuard,
  type NavigationGuardResult,
  type ResolvedRoute,
  type RouteRecord,
  type Router,
  type RouterInstance,
  type RouterOptions,
  isLazy,
  type ComponentFn,
} from "./types"
import { resolveRoute, buildPath, buildNameIndex } from "./match"
import { ScrollManager } from "./scroll"

// ─── Router context ───────────────────────────────────────────────────────────
// Context-based access: isolated per request in SSR (ALS-backed via
// @pyreon/runtime-server), isolated per component tree in CSR.
// Falls back to the module-level singleton for code running outside a component
// tree (e.g. programmatic navigation from event handlers).

export const RouterContext = createContext<RouterInstance | null>(null)

// Module-level fallback — safe for CSR (single-threaded), not for concurrent SSR.
// RouterProvider also sets this so legacy useRouter() calls outside the tree work.
let _activeRouter: RouterInstance | null = null

export function getActiveRouter(): RouterInstance | null {
  return useContext(RouterContext) ?? _activeRouter
}

export function setActiveRouter(router: RouterInstance | null): void {
  if (router) router._viewDepth = 0
  _activeRouter = router
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useRouter(): Router {
  const router = useContext(RouterContext) ?? _activeRouter
  if (!router) throw new Error("[nova-router] No router installed. Wrap your app in <RouterProvider router={router}>.")
  return router
}

export function useRoute<TPath extends string = string>(): () => ResolvedRoute<
  import("./types").ExtractParams<TPath>,
  Record<string, string>
> {
  const router = useContext(RouterContext) ?? _activeRouter
  if (!router) throw new Error("[nova-router] No router installed. Wrap your app in <RouterProvider router={router}>.")
  return router.currentRoute as never
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createRouter(options: RouterOptions | RouteRecord[]): Router {
  const opts: RouterOptions = Array.isArray(options) ? { routes: options } : options
  const { routes, mode = "hash", scrollBehavior } = opts

  // Pre-built O(1) name → record index. Computed once at startup.
  const nameIndex = buildNameIndex(routes)

  const guards: NavigationGuard[] = []
  const afterHooks: AfterEachHook[] = []
  const scrollManager = new ScrollManager(scrollBehavior)

  // Navigation generation counter — cancels in-flight navigations when a newer
  // one starts. Prevents out-of-order completion from stale async guards.
  let _navGen = 0

  // ── Initial location ──────────────────────────────────────────────────────

  const getInitialLocation = (): string => {
    // SSR: use explicitly provided url
    if (opts.url) return opts.url
    if (typeof window === "undefined") return "/"
    if (mode === "history") {
      return window.location.pathname + window.location.search
    }
    const hash = window.location.hash
    return hash.startsWith("#") ? hash.slice(1) || "/" : "/"
  }

  const getCurrentLocation = (): string => {
    if (typeof window === "undefined") return currentPath()
    if (mode === "history") {
      return window.location.pathname + window.location.search
    }
    const hash = window.location.hash
    return hash.startsWith("#") ? hash.slice(1) || "/" : "/"
  }

  // ── Signals ───────────────────────────────────────────────────────────────

  const currentPath = signal(getInitialLocation())
  const currentRoute = computed<ResolvedRoute>(() => resolveRoute(currentPath(), routes))

  if (typeof window !== "undefined") {
    if (mode === "history") {
      window.addEventListener("popstate", () => currentPath.set(getCurrentLocation()))
    } else {
      window.addEventListener("hashchange", () => currentPath.set(getCurrentLocation()))
    }
  }

  const componentCache = new Map<RouteRecord, ComponentFn>()
  const loadingSignal = signal(0)

  // ── Navigation ────────────────────────────────────────────────────────────

  async function navigate(path: string, replace: boolean, redirectDepth = 0): Promise<void> {
    if (redirectDepth > 10) {
      console.error("[nova-router] Circular redirect detected, aborting navigation to:", path)
      return
    }

    const gen = ++_navGen  // claim this navigation generation
    loadingSignal.update((n) => n + 1)

    const to = resolveRoute(path, routes)
    const from = currentRoute()

    // Evaluate redirect before guards (no guard needed for redirects)
    const leaf = to.matched[to.matched.length - 1]
    if (leaf?.redirect) {
      const target = typeof leaf.redirect === "function" ? leaf.redirect(to) : leaf.redirect
      loadingSignal.update((n) => n - 1)
      return navigate(target, replace, redirectDepth + 1)
    }

    // Per-route beforeLeave guards (run on the FROM route's records)
    for (const record of from.matched) {
      if (record.beforeLeave) {
        const routeGuards = Array.isArray(record.beforeLeave)
          ? record.beforeLeave
          : [record.beforeLeave]
        for (const guard of routeGuards) {
          const result = await runGuard(guard, to, from)
          if (gen !== _navGen) { loadingSignal.update((n) => n - 1); return }
          if (result === false) { loadingSignal.update((n) => n - 1); return }
          if (typeof result === "string") {
            loadingSignal.update((n) => n - 1)
            return navigate(result, replace, redirectDepth + 1)
          }
        }
      }
    }

    // Per-route beforeEnter guards
    for (const record of to.matched) {
      if (record.beforeEnter) {
        const routeGuards = Array.isArray(record.beforeEnter)
          ? record.beforeEnter
          : [record.beforeEnter]
        for (const guard of routeGuards) {
          const result = await runGuard(guard, to, from)
          if (gen !== _navGen) { loadingSignal.update((n) => n - 1); return }
          if (result === false) { loadingSignal.update((n) => n - 1); return }
          if (typeof result === "string") {
            loadingSignal.update((n) => n - 1)
            return navigate(result, replace, redirectDepth + 1)
          }
        }
      }
    }

    // Global beforeEach guards
    for (const guard of guards) {
      const result = await runGuard(guard, to, from)
      if (gen !== _navGen) { loadingSignal.update((n) => n - 1); return }
      if (result === false) { loadingSignal.update((n) => n - 1); return }
      if (typeof result === "string") {
        loadingSignal.update((n) => n - 1)
        return navigate(result, replace, redirectDepth + 1)
      }
    }

    // Cancel any in-flight loaders from the previous navigation
    router._abortController?.abort()
    const ac = new AbortController()
    router._abortController = ac

    // Run loaders for all matched records in parallel before committing
    const loadableRecords = to.matched.filter((r) => r.loader)
    if (loadableRecords.length > 0) {
      const loaderCtx: LoaderContext = { params: to.params, query: to.query, signal: ac.signal }
      const results = await Promise.all(
        loadableRecords.map((r) =>
          r.loader?.(loaderCtx).catch((err: unknown) => {
            if (ac.signal.aborted) return undefined
            console.error("[nova-router] loader failed:", err)
            return undefined
          }),
        ),
      )
      if (gen !== _navGen) return  // superseded while loaders were running
      loadableRecords.forEach((r, i) => router._loaderData.set(r, results[i]))
    }

    // Save scroll position before leaving
    scrollManager.save(from.path)

    // Commit navigation
    if (typeof window !== "undefined") {
      if (mode === "history") {
        if (replace) {
          window.history.replaceState(null, "", path)
        } else {
          window.history.pushState(null, "", path)
        }
        currentPath.set(path)
      } else {
        currentPath.set(path)
        // Use history.pushState/replaceState instead of window.location.hash
        // to avoid firing hashchange (which would redundantly set currentPath again).
        const hashUrl = `#${path}`
        if (replace) {
          window.history.replaceState(null, "", hashUrl)
        } else {
          window.history.pushState(null, "", hashUrl)
        }
      }
    } else {
      currentPath.set(path)
    }

    // Apply document title from route meta
    if (typeof document !== "undefined" && to.meta.title) {
      document.title = to.meta.title
    }

    // Prune loader data for routes no longer in the matched stack
    for (const record of router._loaderData.keys()) {
      if (!to.matched.includes(record)) {
        router._loaderData.delete(record)
      }
    }

    // Run afterEach hooks
    for (const hook of afterHooks) {
      try { hook(to, from) } catch (err) {
        console.error("[nova-router] afterEach hook threw:", err)
      }
    }

    // Restore scroll after DOM has updated
    if (typeof window !== "undefined") {
      queueMicrotask(() => scrollManager.restore(to, from))
    }

    loadingSignal.update((n) => n - 1)
  }

  // ── Public router object ──────────────────────────────────────────────────

  const router: RouterInstance = {
    routes,
    mode,
    currentRoute,
    _currentPath: currentPath,
    _currentRoute: currentRoute,
    _componentCache: componentCache,
    _loadingSignal: loadingSignal,
    _scrollPositions: new Map(),
    _scrollBehavior: scrollBehavior,
    _viewDepth: 0,
    _erroredChunks: new Set(),
    _loaderData: new Map(),
    _abortController: null,

    async push(location: string | { name: string; params?: Record<string, string>; query?: Record<string, string> }) {
      if (typeof location === "string") return navigate(sanitizePath(location), false)
      const path = resolveNamedPath(location.name, location.params ?? {}, location.query ?? {}, nameIndex)
      return navigate(path, false)
    },

    async replace(path: string) {
      return navigate(sanitizePath(path), true)
    },

    back() {
      if (typeof window !== "undefined") window.history.back()
    },

    beforeEach(guard: NavigationGuard) {
      guards.push(guard)
    },

    afterEach(hook: AfterEachHook) {
      afterHooks.push(hook)
    },

    loading: () => loadingSignal() > 0,

    _resolve: (rawPath: string) => resolveRoute(rawPath, routes),
  }

  return router
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function runGuard(
  guard: NavigationGuard,
  to: ResolvedRoute,
  from: ResolvedRoute,
): Promise<NavigationGuardResult> {
  try {
    return await guard(to, from)
  } catch (err) {
    console.error("[nova-router] Navigation guard threw:", err)
    return false
  }
}

function resolveNamedPath(
  name: string,
  params: Record<string, string>,
  query: Record<string, string>,
  index: Map<string, RouteRecord>,
): string {
  const record = index.get(name)
  if (!record) {
    console.warn(`[nova-router] No route named "${name}"`)
    return "/"
  }
  let path = buildPath(record.path, params)
  const qs = Object.entries(query)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&")
  if (qs) path += `?${qs}`
  return path
}

/** Block javascript: and data: URI injection in navigation targets. */
function sanitizePath(path: string): string {
  if (/^\s*(?:javascript|data):/i.test(path)) {
    console.warn(`[nova-router] Blocked unsafe navigation target: "${path}"`)
    return "/"
  }
  return path
}

export { isLazy }
