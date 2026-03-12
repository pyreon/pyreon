import { createContext, useContext } from "@pyreon/core"
import { computed, signal } from "@pyreon/reactivity"
import { buildNameIndex, buildPath, resolveRoute } from "./match"
import { ScrollManager } from "./scroll"
import {
  type AfterEachHook,
  type ComponentFn,
  isLazy,
  type LoaderContext,
  type NavigationGuard,
  type NavigationGuardResult,
  type ResolvedRoute,
  type RouteRecord,
  type Router,
  type RouterInstance,
  type RouterOptions,
} from "./types"

// Evaluated once at module load — collapses to `true` in browser / happy-dom,
// `false` on the server. Using a constant avoids per-call `typeof` branches
// that are uncoverable in test environments.
const _isBrowser = typeof window !== "undefined"

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
  if (!router)
    throw new Error(
      "[pyreon-router] No router installed. Wrap your app in <RouterProvider router={router}>.",
    )
  return router
}

export function useRoute<TPath extends string = string>(): () => ResolvedRoute<
  import("./types").ExtractParams<TPath>,
  Record<string, string>
> {
  const router = useContext(RouterContext) ?? _activeRouter
  if (!router)
    throw new Error(
      "[pyreon-router] No router installed. Wrap your app in <RouterProvider router={router}>.",
    )
  return router.currentRoute as never
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createRouter(options: RouterOptions | RouteRecord[]): Router {
  const opts: RouterOptions = Array.isArray(options) ? { routes: options } : options
  const { routes, mode = "hash", scrollBehavior, onError, maxCacheSize = 100 } = opts

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
    if (!_isBrowser) return "/"
    if (mode === "history") {
      return window.location.pathname + window.location.search
    }
    const hash = window.location.hash
    return hash.startsWith("#") ? hash.slice(1) || "/" : "/"
  }

  const getCurrentLocation = (): string => {
    if (!_isBrowser) return currentPath()
    if (mode === "history") {
      return window.location.pathname + window.location.search
    }
    const hash = window.location.hash
    return hash.startsWith("#") ? hash.slice(1) || "/" : "/"
  }

  // ── Signals ───────────────────────────────────────────────────────────────

  const currentPath = signal(getInitialLocation())
  const currentRoute = computed<ResolvedRoute>(() => resolveRoute(currentPath(), routes))

  // Browser event listeners — stored so destroy() can remove them
  let _popstateHandler: (() => void) | null = null
  let _hashchangeHandler: (() => void) | null = null

  if (_isBrowser) {
    if (mode === "history") {
      _popstateHandler = () => currentPath.set(getCurrentLocation())
      window.addEventListener("popstate", _popstateHandler)
    } else {
      _hashchangeHandler = () => currentPath.set(getCurrentLocation())
      window.addEventListener("hashchange", _hashchangeHandler)
    }
  }

  const componentCache = new Map<RouteRecord, ComponentFn>()
  const loadingSignal = signal(0)

  // ── Navigation ────────────────────────────────────────────────────────────

  async function navigate(path: string, replace: boolean, redirectDepth = 0): Promise<void> {
    if (redirectDepth > 10) {
      console.error("[pyreon-router] Circular redirect detected, aborting navigation to:", path)
      return
    }

    const gen = ++_navGen // claim this navigation generation
    loadingSignal.update((n) => n + 1)

    const to = resolveRoute(path, routes)
    const from = currentRoute()

    // Evaluate redirect before guards (no guard needed for redirects)
    const leaf = to.matched[to.matched.length - 1]
    if (leaf?.redirect) {
      const target = sanitizePath(
        typeof leaf.redirect === "function" ? leaf.redirect(to) : leaf.redirect,
      )
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
          if (gen !== _navGen) {
            loadingSignal.update((n) => n - 1)
            return
          }
          if (result === false) {
            loadingSignal.update((n) => n - 1)
            return
          }
          if (typeof result === "string") {
            loadingSignal.update((n) => n - 1)
            return navigate(sanitizePath(result), replace, redirectDepth + 1)
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
          if (gen !== _navGen) {
            loadingSignal.update((n) => n - 1)
            return
          }
          if (result === false) {
            loadingSignal.update((n) => n - 1)
            return
          }
          if (typeof result === "string") {
            loadingSignal.update((n) => n - 1)
            return navigate(sanitizePath(result), replace, redirectDepth + 1)
          }
        }
      }
    }

    // Global beforeEach guards
    for (const guard of guards) {
      const result = await runGuard(guard, to, from)
      if (gen !== _navGen) {
        loadingSignal.update((n) => n - 1)
        return
      }
      if (result === false) {
        loadingSignal.update((n) => n - 1)
        return
      }
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
      const results = await Promise.allSettled(
        loadableRecords.map((r) => {
          if (!r.loader) return Promise.resolve(undefined)
          return r.loader(loaderCtx)
        }),
      )
      if (gen !== _navGen) return // superseded while loaders were running

      for (let i = 0; i < loadableRecords.length; i++) {
        const result = results[i]
        const record = loadableRecords[i]
        if (!result || !record) continue
        if (result.status === "fulfilled") {
          router._loaderData.set(record, result.value)
        } else {
          if (ac.signal.aborted) continue
          const err = result.reason
          console.error("[pyreon-router] loader failed:", err)
          if (router._onError) {
            const cancel = router._onError(err, to)
            if (cancel === false) {
              loadingSignal.update((n) => n - 1)
              return
            }
          }
          // Store the error so errorComponent can render it
          router._loaderData.set(record, undefined)
        }
      }
    }

    // Save scroll position before leaving
    scrollManager.save(from.path)

    // Commit navigation — always update the signal, then sync browser URL if available
    currentPath.set(path)
    if (_isBrowser) {
      if (mode === "history") {
        if (replace) {
          window.history.replaceState(null, "", path)
        } else {
          window.history.pushState(null, "", path)
        }
      } else {
        // Use history.pushState/replaceState instead of window.location.hash
        // to avoid firing hashchange (which would redundantly set currentPath again).
        const hashUrl = `#${path}`
        if (replace) {
          window.history.replaceState(null, "", hashUrl)
        } else {
          window.history.pushState(null, "", hashUrl)
        }
      }
    }

    // Apply document title from route meta
    if (_isBrowser && to.meta.title) {
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
      try {
        hook(to, from)
      } catch (err) {
        console.error("[pyreon-router] afterEach hook threw:", err)
      }
    }

    // Restore scroll after DOM has updated
    if (_isBrowser) {
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
    _onError: onError,
    _maxCacheSize: maxCacheSize,

    async push(
      location:
        | string
        | { name: string; params?: Record<string, string>; query?: Record<string, string> },
    ) {
      if (typeof location === "string") return navigate(sanitizePath(location), false)
      const path = resolveNamedPath(
        location.name,
        location.params ?? {},
        location.query ?? {},
        nameIndex,
      )
      return navigate(path, false)
    },

    async replace(path: string) {
      return navigate(sanitizePath(path), true)
    },

    back() {
      if (_isBrowser) window.history.back()
    },

    beforeEach(guard: NavigationGuard) {
      guards.push(guard)
      return () => {
        const idx = guards.indexOf(guard)
        if (idx >= 0) guards.splice(idx, 1)
      }
    },

    afterEach(hook: AfterEachHook) {
      afterHooks.push(hook)
      return () => {
        const idx = afterHooks.indexOf(hook)
        if (idx >= 0) afterHooks.splice(idx, 1)
      }
    },

    loading: () => loadingSignal() > 0,

    destroy() {
      if (_popstateHandler) {
        window.removeEventListener("popstate", _popstateHandler)
        _popstateHandler = null
      }
      if (_hashchangeHandler) {
        window.removeEventListener("hashchange", _hashchangeHandler)
        _hashchangeHandler = null
      }
      guards.length = 0
      afterHooks.length = 0
      componentCache.clear()
      router._loaderData.clear()
      router._abortController?.abort()
      router._abortController = null
    },

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
    console.error("[pyreon-router] Navigation guard threw:", err)
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
    console.warn(`[pyreon-router] No route named "${name}"`)
    return "/"
  }
  let path = buildPath(record.path, params)
  const qs = Object.entries(query)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&")
  if (qs) path += `?${qs}`
  return path
}

/** Block unsafe navigation targets: javascript/data/vbscript URIs and absolute URLs. */
function sanitizePath(path: string): string {
  const trimmed = path.trim()
  if (/^(?:javascript|data|vbscript):/i.test(trimmed)) {
    console.warn(`[pyreon-router] Blocked unsafe navigation target: "${path}"`)
    return "/"
  }
  // Block absolute URLs and protocol-relative URLs — router only handles same-origin paths
  if (/^\/\/|^https?:/i.test(trimmed)) {
    console.warn(`[pyreon-router] Blocked external navigation target: "${path}"`)
    return "/"
  }
  return path
}

export { isLazy }
