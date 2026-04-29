import type { ClassValue, ComponentFn, Props, VNodeChild } from '@pyreon/core'
import { createRef, cx, ErrorBoundary, h, onUnmount, provide, useContext } from '@pyreon/core'
import { computed, signal } from '@pyreon/reactivity'
import { LoaderDataContext, prefetchLoaderData } from './loader'
import { isLazy, RouterContext, setActiveRouter } from './router'
import type { LazyComponent, ResolvedRoute, RouteRecord, Router, RouterInstance } from './types'

// Track prefetched paths per router to avoid duplicate fetches
const _prefetched = new WeakMap<RouterInstance, Set<string>>()

// ─── RouterProvider ───────────────────────────────────────────────────────────

export interface RouterProviderProps extends Props {
  router: Router
  children?: VNodeChild
}

export const RouterProvider: ComponentFn<RouterProviderProps> = (props) => {
  const router = props.router as RouterInstance
  // Push router into the context stack — isolated per request in SSR via ALS,
  // isolated per component tree in CSR.
  provide(RouterContext, router)
  onUnmount(() => {
    // Clean up event listeners, caches, abort in-flight navigations.
    // Safe to call multiple times (destroy is idempotent).
    router.destroy()
    setActiveRouter(null)
  })
  // Also set the module fallback so programmatic useRouter() outside a component
  // tree (e.g. navigation guards in event handlers) still works in CSR.
  setActiveRouter(router)
  return props.children ?? null
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

  // ── Structure / data decoupling ───────────────────────────────────────────
  //
  // Pre-fix the reactive child accessor read `_loadingSignal` and the full
  // `currentRoute` snapshot. The framework's `mountReactive` tears down and
  // rebuilds the entire subtree on every accessor re-emission, so any
  // unrelated route signal (loader writes, lazy resolution, navigation
  // start/end counters, param changes that don't change the matched record)
  // would tear down the layout, then the page, then everything below it.
  // For a single page load with one cold-start `router.replace()`, that
  // produced ~9 cascading remounts of the layout — confirmed empirically
  // by instance counters.
  //
  // The fix decouples STRUCTURE (which RouteRecord is mounted at this depth
  // + which component to render for it) from DATA (params / query / loader
  // data flowing into the rendered component). One computed returns BOTH
  // the record and its resolved component as an atomic pair — re-emits ONLY
  // when either side changes (reference equality on both fields). Loader
  // writes / param changes / navigation counters don't re-emit; the rendered
  // component receives route data through reactive props + the
  // `LoaderDataProvider` context, which subscribe per-component to the
  // signals they actually care about, so a param change re-renders just the
  // page leaf — not the layout chain above it.
  //
  // The structure is intentionally a SINGLE computed (not two layered ones):
  // when `currentRoute` changes, the reactive child accessor must see a
  // CONSISTENT (rec, comp) pair on its next re-run. With two layered
  // computeds the child accessor subscribes to both, and the order in which
  // those two notify the child is unspecified — if the child runs after rec
  // is notified but before comp re-evaluates, it reads the new rec paired
  // with the OLD comp. Empirically that produced rec=/button paired with
  // comp=HomePage, leaving the previous page rendered after navigation.
  // Combining them into one computed forces atomic emission.
  interface DepthEntry {
    rec: RouteRecord | null
    comp: ComponentFn | null
    /**
     * True when lazy resolution exhausted retries and the chunk is in
     * `_erroredChunks`. Tracked structurally so the entry re-emits when
     * the error state flips on — otherwise `equals` would block the
     * { rec, comp: null } → { rec, comp: null, errored: true } transition
     * (`comp` and `rec` are unchanged) and the error component would
     * never render.
     */
    errored: boolean
    /**
     * The full ResolvedRoute reference at the time this entry was emitted.
     * `currentRoute` is a `computed` keyed on `currentPath` — same path
     * returns the same memoized reference, different path returns a new
     * one. Tracking the reference in `equals` makes the depth re-emit on
     * any real navigation (params change, query change, hash change) even
     * when the matched record at this depth stays the same — required so
     * `/user/42 → /user/99` re-renders the User component with new params
     * — while NOT re-emitting on navigate-flow noise (`_loadingSignal`
     * start/end ticks, lazy resolution writes that complete without
     * changing currentPath). One emit per real navigation, not per
     * within-navigation signal tick.
     */
    route: ResolvedRoute
  }
  const depthEntry = computed<DepthEntry>(
    () => {
      const route = router.currentRoute()
      const rec = route.matched[depth] ?? null
      if (!rec) return { rec: null, comp: null, errored: false, route }
      // Subscribe to `_loadingSignal` so lazy resolution wakes this
      // computed up — when the cache fills, we re-emit with comp set.
      router._loadingSignal()
      const errored = router._erroredChunks.has(rec)
      if (errored) return { rec, comp: null, errored: true, route }
      const cached = router._componentCache.get(rec)
      if (cached) return { rec, comp: cached, errored: false, route }
      const raw = rec.component
      if (!isLazy(raw)) {
        cacheSet(router, rec, raw)
        return { rec, comp: raw, errored: false, route }
      }
      // Lazy and not yet cached — `child()` below renders the lazy
      // fallback and triggers the load; once the load completes,
      // `_loadingSignal` ticks and this computed re-emits with `comp` set.
      return { rec, comp: null, errored: false, route }
    },
    {
      equals: (a, b) =>
        a.rec === b.rec &&
        a.comp === b.comp &&
        a.errored === b.errored &&
        a.route === b.route,
    },
  )

  const child = (): VNodeChild => {
    const { rec, comp, route } = depthEntry()
    if (!rec) return null

    if (comp) {
      return renderWithLoader(router, rec, comp, route)
    }

    // Component not yet cached — kick off the lazy load. `renderLazyRoute`
    // mutates `_loadingSignal` and `_componentCache` on completion, which
    // re-emits `depthEntry` and re-runs this accessor with `comp` set.
    return renderLazyRoute(router, rec, rec.component as LazyComponent)
  }

  return h('div', { 'data-pyreon-router-view': true }, child as unknown as VNodeChild)
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
   *   - "intent" (default) — prefetch on hover AND focus (covers mouse + keyboard)
   *   - "hover" — prefetch on hover only
   *   - "viewport" — prefetch when the link scrolls into the viewport
   *   - "none" — no prefetching
   */
  prefetch?: 'intent' | 'hover' | 'viewport' | 'none'
  children?: VNodeChild | null
}

export const RouterLink: ComponentFn<RouterLinkProps> = (props) => {
  const router = useContext(RouterContext)
  const prefetchMode = props.prefetch ?? 'intent'

  const handleClick = (e: MouseEvent) => {
    e.preventDefault()
    if (!router) return
    if (props.replace) {
      router.replace(props.to)
    } else {
      router.push(props.to)
    }
  }

  const triggerPrefetch = () => {
    if (!router) return
    prefetchRoute(router as RouterInstance, props.to)
  }

  const handleMouseEnter = () => {
    if (prefetchMode === 'hover' || prefetchMode === 'intent') triggerPrefetch()
  }

  const handleFocus = () => {
    if (prefetchMode === 'intent') triggerPrefetch()
  }

  const inst = router as RouterInstance | null
  // `href` MUST be an accessor, not a string captured at setup. `props.to`
  // is a getter when the parent passes a reactive expression (the JSX
  // compiler wraps `<RouterLink to={someExpr}>` as `_rp(() => someExpr)`).
  // Capturing into a string at setup time freezes the URL — passing the
  // accessor lets `applyProp` wrap it in `renderEffect` so href tracks the
  // underlying signal.
  const href = (): string =>
    inst?.mode === 'history' ? `${inst._base}${props.to}` : `#${props.to}`

  const isExactMatch = (): boolean => {
    if (!router) return false
    const target = props.to
    if (typeof target !== 'string') return false
    return router.currentRoute().path === target
  }

  const activeClass = (): string => {
    if (!router) return ''
    const current = router.currentRoute().path
    const target = props.to
    if (typeof target !== 'string') return ''
    const isExact = current === target
    const isActive = isExact || (!props.exact && isSegmentPrefix(current, target))

    const classes: string[] = []
    if (isActive) classes.push(props.activeClass ?? 'router-link-active')
    if (isExact) classes.push(props.exactActiveClass ?? 'router-link-exact-active')
    return classes.join(' ').trim()
  }

  const ariaCurrent = (): string | undefined => isExactMatch() ? 'page' : undefined

  // Viewport prefetching — observe link visibility with IntersectionObserver
  const ref = createRef<Element>()
  if (prefetchMode === 'viewport' && router && typeof IntersectionObserver !== 'undefined') {
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

  // Forward all non-RouterLink props (style, id, data-*, etc.) to the <a>.
  // `class` is pulled out separately so it can be MERGED with the internal
  // active-class accessor — overriding the user's class silently dropped any
  // conditional class the consumer wanted (e.g. `class={() => cond ? 'on' : ''}`).
  const {
    to: _to,
    replace: _replace,
    activeClass: _ac,
    exactActiveClass: _eac,
    exact: _exact,
    prefetch: _prefetch,
    class: userClass,
    children,
    ...rest
  } = props as RouterLinkProps & { class?: ClassValue | (() => ClassValue) }

  // Compose the user-provided `class` (string / array / object / function) with
  // the internal `activeClass` accessor. Returning a function lets `applyProp`
  // wrap it in `renderEffect` once — so navigation re-evaluates BOTH sides on
  // every route change without rebuilding the link.
  const mergedClass = (): string => {
    const userResolved =
      typeof userClass === 'function' ? (userClass as () => ClassValue)() : userClass
    return cx([userResolved, activeClass()] as ClassValue)
  }

  return h(
    'a',
    {
      ...rest,
      ref,
      href,
      class: mergedClass,
      'aria-current': ariaCurrent,
      onClick: handleClick,
      onMouseEnter: handleMouseEnter,
      onFocus: handleFocus,
    },
    children ?? props.to,
  )
}

/** Prefetch loader data for a route (only once per router + path). */
const MAX_PREFETCH_CACHE = 50

function prefetchRoute(router: RouterInstance, path: string): void {
  let set = _prefetched.get(router)
  if (!set) {
    set = new Set()
    _prefetched.set(router, set)
  }
  if (set.has(path)) return
  // Evict oldest entries when cache is full to prevent unbounded growth
  if (set.size >= MAX_PREFETCH_CACHE) {
    const first = set.values().next().value as string
    set.delete(first)
  }
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
        const resolved = typeof mod === 'function' ? mod : mod.default
        cacheSet(router, record, resolved)
        router._loadingSignal.update((n) => n + 1)
      })
      .catch((err: unknown) => {
        if (attempt < 3) {
          return new Promise<void>((res) => setTimeout(res, 500 * 2 ** attempt)).then(() =>
            tryLoad(attempt + 1),
          )
        }
        if (typeof window !== 'undefined' && isStaleChunk(err)) {
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
  route: Pick<ResolvedRoute, 'params' | 'query' | 'meta'>,
): VNodeChild {
  const routeProps = { params: route.params, query: route.query, meta: route.meta }

  // If route has an error component, wrap rendering in error boundary
  if (record.errorComponent) {
    return h(ErrorBoundary, {
      fallback: (error: Error) => h(record.errorComponent!, { ...routeProps, error }),
      children: record.loader
        ? renderLoaderContent(router, record, Comp, routeProps)
        : h(Comp, routeProps),
    })
  }

  if (!record.loader) return h(Comp, routeProps)
  return renderLoaderContent(router, record, Comp, routeProps)
}

function renderLoaderContent(
  router: RouterInstance,
  record: RouteRecord,
  Comp: ComponentFn,
  routeProps: Record<string, unknown>,
): VNodeChild {
  const data = router._loaderData.get(record)

  if (data !== undefined) {
    return h(LoaderDataProvider, { data, children: h(Comp, routeProps) })
  }

  // Data not yet available — show pending component if configured
  if (record.pendingComponent) {
    return h(PendingLoader as unknown as ComponentFn, {
      router,
      record,
      Comp,
      routeProps,
    })
  }

  if (record.errorComponent) {
    return h(record.errorComponent, routeProps)
  }
  return h(LoaderDataProvider, { data, children: h(Comp, routeProps) })
}

/**
 * Signal-based pending component with timing control.
 *
 * State machine: hidden → pending → ready
 * - hidden: initial state, nothing shown (lasts pendingMs)
 * - pending: pendingComponent shown (lasts at least pendingMinMs)
 * - ready: real component shown (loader data arrived + minTime elapsed)
 */
function PendingLoader(props: {
  router: RouterInstance
  record: RouteRecord
  Comp: ComponentFn
  routeProps: Record<string, unknown>
}): VNodeChild {
  const { router, record, Comp, routeProps } = props
  const pendingMs = record.pendingMs ?? 0
  const pendingMinMs = record.pendingMinMs ?? 200

  type Phase = 'hidden' | 'pending' | 'ready'
  const phase = signal<Phase>(pendingMs === 0 ? 'pending' : 'hidden')

  let pendingTimer: ReturnType<typeof setTimeout> | null = null
  let minTimer: ReturnType<typeof setTimeout> | null = null
  let minTimeElapsed = pendingMs === 0 ? false : true // if no delay, minTime matters
  let dataReady = false

  if (pendingMs === 0) {
    // Show pending immediately, start minTime countdown
    minTimeElapsed = false
    minTimer = setTimeout(() => {
      minTimeElapsed = true
      minTimer = null
      if (dataReady) phase.set('ready')
    }, pendingMinMs)
  } else {
    // Delay before showing pending
    pendingTimer = setTimeout(() => {
      pendingTimer = null
      if (dataReady) {
        // Data arrived during delay — skip pending entirely
        phase.set('ready')
      } else {
        phase.set('pending')
        minTimeElapsed = false
        minTimer = setTimeout(() => {
          minTimeElapsed = true
          minTimer = null
          if (dataReady) phase.set('ready')
        }, pendingMinMs)
      }
    }, pendingMs)
  }

  // Watch for loader data arrival
  const checkData = () => {
    const data = router._loaderData.get(record)
    if (data !== undefined) {
      dataReady = true
      if (phase.peek() === 'hidden') {
        // Data arrived before pendingMs — skip pending, go straight to ready
        if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null }
        phase.set('ready')
      } else if (minTimeElapsed) {
        phase.set('ready')
      }
      // else: pending is showing but minTime hasn't elapsed — wait for minTimer
    }
  }

  // Poll via loadingSignal reactivity — re-checks when navigation completes
  // This runs inside the reactive accessor below

  onUnmount(() => {
    if (pendingTimer) clearTimeout(pendingTimer)
    if (minTimer) clearTimeout(minTimer)
  })

  return (() => {
    // Track router's loading signal to re-run when loader completes
    router._loadingSignal()
    checkData()

    const p = phase()
    if (p === 'hidden') return null
    if (p === 'pending') return h(record.pendingComponent!, routeProps)
    // ready
    const data = router._loaderData.get(record)
    return h(LoaderDataProvider, { data, children: h(Comp, routeProps) })
  }) as unknown as VNodeChild
}

/**
 * Thin provider component that pushes LoaderDataContext before children mount.
 * Uses Pyreon's context stack so useLoaderData() reads it during child setup.
 */
function LoaderDataProvider(props: { data: unknown; children: VNodeChild }): VNodeChild {
  provide(LoaderDataContext, props.data)
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
  if (target === '/') return false
  const cs = current.split('/').filter(Boolean)
  const ts = target.split('/').filter(Boolean)
  if (ts.length > cs.length) return false
  return ts.every((seg, i) => seg === cs[i])
}

/**
 * Detect a stale chunk error — happens post-deploy when the browser requests
 * a hashed filename that no longer exists on the server. Trigger a full reload
 * so the user gets the new bundle instead of a broken loading state.
 */
function isStaleChunk(err: unknown): boolean {
  if (err instanceof TypeError && String(err.message).includes('Failed to fetch')) return true
  if (err instanceof SyntaxError) return true
  return false
}
