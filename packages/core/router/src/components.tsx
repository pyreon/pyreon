import type { ClassValue, ComponentFn, Props, VNodeChild } from '@pyreon/core'
import {
  createRef,
  cx,
  ErrorBoundary,
  h,
  nativeCompat,
  onMount,
  onUnmount,
  provide,
  useContext,
} from '@pyreon/core'
import { computed, isClient, signal } from '@pyreon/reactivity'
import { announceRouteChange } from './announcer'
import { LoaderDataContext, prefetchLoaderData } from './loader'
import { _setDefaultChromeLayout } from './match'
import { getActiveRouter, isLazy, RouterContext, setActiveRouter } from './router'
import type { LazyComponent, ResolvedRoute, RouteRecord, Router, RouterInstance } from './types'
import { type CheckHref, classifyHref, toRouterPath } from './typed-routes'

// Track prefetched paths per router to avoid duplicate fetches
const _prefetched = new WeakMap<RouterInstance, Set<string>>()

// ─── RouterProvider ───────────────────────────────────────────────────────────

export interface RouterProviderProps extends Props {
  router: Router
  children?: VNodeChild
}

const RouterProvider: ComponentFn<RouterProviderProps> = (props) => {
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
  /**
   * Announce route changes to screen readers via a visually-hidden
   * `aria-live` region (the new page's `document.title`, falling back to the
   * pathname). Default `true`. Only the ROOT `<RouterView>` announces — nested
   * (layout) views ignore this. Set `false` to opt out (e.g. if you run your
   * own route announcer).
   */
  announceRouteChanges?: boolean
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
const RouterView: ComponentFn<RouterViewProps> = (props) => {
  const router = ((props.router as RouterInstance | undefined) ??
    useContext(RouterContext)) as RouterInstance | null
  if (!router) return null

  // Claim this view's depth at setup time (depth-first component init order)
  const depth = router._viewDepth
  router._viewDepth++

  onUnmount(() => {
    router._viewDepth--
  })

  // Root-only, client-only route announcer (a11y — WAI-ARIA / Next.js-style):
  // tell screen-reader users the page changed on each navigation. Registered
  // in `onMount`, so the INITIAL page load is NOT announced (the SR already
  // reads the freshly-loaded page) — only genuine path changes from here on
  // fire. `afterEach` returns its own unsubscribe, which `onMount` treats as
  // the cleanup. Opt out via `<RouterView announceRouteChanges={false}>`.
  if (depth === 0 && isClient && props.announceRouteChanges !== false) {
    onMount(() => {
      let prevPath = router.currentRoute().path
      return router.afterEach((to) => {
        if (to.path === prevPath) return // same-path (query/hash) — not a page change
        prevPath = to.path
        announceRouteChange(to.path)
      })
    })
  }

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
    /**
     * This depth's record's OWN loader data (only when the record carries a
     * loader; `undefined` otherwise). Compared in `equals` for non-leaf depths
     * so a parameterised parent LAYOUT with its own loader re-emits — and thus
     * re-mounts, re-reading `useLoaderData()` in its body — when its data
     * changes across a child navigation (`/users/42/… → /users/99/…`). A
     * loader-LESS layout (the common chrome/sidebar case) keeps `loaderData`
     * `undefined` on both sides → still mounts once (preserves the layout-
     * persistence win). Read inside the computed so it tracks the `currentRoute`
     * / `_loadingSignal` deps already subscribed above.
     */
    loaderData: unknown
  }
  const depthEntry = computed<DepthEntry>(
    () => {
      const route = router.currentRoute()
      const rec = route.matched[depth] ?? null
      if (!rec) return { rec: null, comp: null, errored: false, route, loaderData: undefined }
      // Subscribe to `_loadingSignal` so lazy resolution wakes this
      // computed up — when the cache fills, we re-emit with comp set.
      router._loadingSignal()
      // PR-S8: subscribe to `_hmrTick` (dev-only — undefined in prod)
      // so a successful HMR swap forces a re-emit. Pre-PR-S8 the HMR
      // swap bumped `_loadingSignal` directly with `+ 1` and never
      // paired a `- 1`, leaving `useTransition()` stuck `true` for the
      // page lifetime. Now HMR uses its own counter and the navigation
      // counter stays clean. The `?.()` optional-call gracefully no-ops
      // in prod where `_hmrTick` is undefined (no HMR there).
      router._hmrTick?.()
      // This depth's OWN loader data (undefined for a loader-less layout).
      // `_loaderData` is written by `runBlockingLoaders` BEFORE `commitNavigation`
      // flips `currentRoute`, and bumps `_loadingSignal` on async settle — both
      // subscribed above — so this read reflects the latest data and `equals`
      // re-emits a loader-bearing parent layout when its data changes.
      const loaderData =
        rec.loader || rec.serverLoader || rec.hasServerLoader
          ? router._loaderData.get(rec)
          : undefined
      const errored = router._erroredChunks.has(rec)
      if (errored) return { rec, comp: null, errored: true, route, loaderData }
      const cached = router._componentCache.get(rec)
      if (cached) return { rec, comp: cached, errored: false, route, loaderData }
      const raw = rec.component
      if (!isLazy(raw)) {
        cacheSet(router, rec, raw)
        return { rec, comp: raw, errored: false, route, loaderData }
      }
      // Lazy and not yet cached — `child()` below renders the lazy
      // fallback and triggers the load; once the load completes,
      // `_loadingSignal` ticks and this computed re-emits with `comp` set.
      return { rec, comp: null, errored: false, route, loaderData }
    },
    {
      // Re-emit (→ re-mount the subtree at this depth) when this depth's
      // record / resolved component / error-state changes. The `route`
      // object is fresh on EVERY navigation, so comparing it at every depth
      // would re-mount the WHOLE matched chain — including PARENT LAYOUTS —
      // on every page change, defeating the "layouts mount once" contract
      // (a parent layout re-mount tears down its sidebar/header state, e.g.
      // resetting scroll position and flashing the chrome). A parent layout
      // renders chrome + an inner <RouterView>; it does NOT consume the
      // leaf's params/query/loader, so it must persist across child
      // navigations. Only the LEAF (the param/loader-consuming page) re-emits
      // on a route change, so its `renderWithLoader` re-renders with fresh
      // params/query/meta + loader data. A parent layout that reads the leaf's
      // params/query reads them reactively via `useParams()` (keyed off the
      // `currentRoute` signal), which updates without a re-mount.
      //
      // EXCEPTION: a parameterised parent layout with its OWN loader (e.g.
      // `/users/:id` whose loader fetches the user) must reflect NEW data when
      // its param changes across a child navigation (`/users/42/profile →
      // /users/99/profile`). `useLoaderData()` reads a plain (non-reactive)
      // context snapshot — depth-specific, so it can't fall back to a signal the
      // way `useParams()` does — so a never-re-mounting parent would stay STALE.
      // We re-emit (re-mount, re-reading `useLoaderData()` in the body) only when
      // THIS depth's own loader data changed. Loader-less layouts keep
      // `loaderData === undefined` on both sides → still mount once.
      equals: (a, b) => {
        if (a.rec !== b.rec || a.comp !== b.comp || a.errored !== b.errored) {
          return false
        }
        const isLeaf = depth >= b.route.matched.length - 1
        if (isLeaf) return a.route === b.route
        return a.loaderData === b.loaderData
      },
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

export interface RouterLinkProps<T extends string = string> extends Props {
  /**
   * The destination. Typo-checked against the app's registered routes when
   * typed routes are enabled (else any `string`); external URLs (`https://…`,
   * `mailto:`, `#hash`, …) and dynamic `string` variables are always accepted.
   * See `CheckHref` / `RegisteredRoutes`.
   */
  to: CheckHref<T>
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
  /**
   * Override the auto internal/external classification of `to`:
   *   - `true`  — force external (full browser navigation, new-tab eligible).
   *   - `false` — force internal (client-side routing), e.g. for a same-origin
   *     absolute URL you want handled by the router.
   *   - omitted — auto-detect (URLs with a scheme / protocol-relative /
   *     cross-origin → external; registered/relative paths → internal).
   */
  external?: boolean
  /** Override the anchor `target` (auto: `_blank` for external new-tab links). */
  target?: string
  /** Override the anchor `rel` (auto: `noopener noreferrer` for `_blank`). */
  rel?: string
  children?: VNodeChild | null
}

// Dev-only once-per-`to` dedupe for the no-provider warning below. A missing
// provider typically breaks EVERY link on the page — one warning per distinct
// destination is signal, N-per-row-list is noise.
const _warnedNoRouterLinks = new Set<string>()

/**
 * Runtime implementation. Typed against the WIDENED props (`RouterLinkProps` =
 * `RouterLinkProps<string>`, so `to` is `string`); the exported `RouterLink`
 * carries the generic `<const T>` signature for compile-time `to` validation.
 */
const RouterLinkImpl: ComponentFn<RouterLinkProps> = (props) => {
  // Resolve the router the SAME way every router hook does (router.ts:
  // `useContext(RouterContext) ?? _activeRouter`) — context first (per-request
  // in SSR, per-tree in CSR), falling back to the module-level active router.
  // Pre-fix this read the context BARE, so a link outside a <RouterProvider>
  // subtree ignored a router that `setActiveRouter()` had made visible to
  // every hook, and rendered a hash-fallback href.
  const router = getActiveRouter()
  const prefetchMode = props.prefetch ?? 'intent'
  const inst = router as RouterInstance | null

  // Dev-only (client-only) warning: with NO router resolvable the link
  // degrades to a plain anchor (full page load on click) — almost always a
  // missing provider, so make it visible. Client-only on purpose: SSR/SSG
  // resolves context via the request stack and prerender pipelines
  // legitimately render link-bearing trees the CSR provider re-establishes.
  if (process.env.NODE_ENV !== 'production' && isClient && !router) {
    const to = String(props.to)
    if (!_warnedNoRouterLinks.has(to)) {
      _warnedNoRouterLinks.add(to)
      console.warn(
        `[Pyreon] <RouterLink to="${to}"> rendered without a RouterProvider — falling back to a plain anchor (full page load on click). Wrap the tree in <RouterProvider router={…}>.`,
      )
    }
  }

  // Resolve the effective navigation kind, honouring the per-link `external`
  // override (true → external, false → internal) over the auto-classification.
  // Recomputed on read so it tracks a reactive `to`. `internal` uses the client
  // router; every other kind (external / hash / protocol) is left to the browser.
  const isInternal = (): boolean => {
    if (props.external === true) return false
    if (props.external === false) return true
    return classifyHref(props.to, inst?._linkConfig) === 'internal'
  }
  const isExternalNewTabEligible = (): boolean => {
    if (props.external === false) return false
    if (props.external === true) return true
    return classifyHref(props.to, inst?._linkConfig) === 'external'
  }

  const handleClick = (e: MouseEvent) => {
    // Modifier / non-primary clicks (ctrl/meta/shift/middle) always fall through
    // to the browser's native open-in-new-tab behaviour.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (!isInternal()) return // external / hash / mailto → let the browser navigate
    // No router resolvable — bail BEFORE preventDefault so the link degrades
    // to a NATIVE anchor (full-load navigation to the plain-path href below).
    // Pre-fix preventDefault ran first, swallowing the click → dead link.
    if (!router) return
    e.preventDefault()
    const path = toRouterPath(props.to)
    if (props.replace) {
      router.replace(path)
    } else {
      router.push(path)
    }
  }

  const triggerPrefetch = () => {
    if (!router || !isInternal()) return // never prefetch external destinations
    prefetchRoute(router as RouterInstance, toRouterPath(props.to))
  }

  const handleMouseEnter = () => {
    if (prefetchMode === 'hover' || prefetchMode === 'intent') triggerPrefetch()
  }

  const handleFocus = () => {
    if (prefetchMode === 'intent') triggerPrefetch()
  }

  // `href` MUST be an accessor, not a string captured at setup. `props.to`
  // is a getter when the parent passes a reactive expression (the JSX
  // compiler wraps `<RouterLink to={someExpr}>` as `_rp(() => someExpr)`).
  // Capturing into a string at setup time freezes the URL — passing the
  // accessor lets `applyProp` wrap it in `renderEffect` so href tracks the
  // underlying signal. External/hash/protocol hrefs are emitted verbatim; only
  // internal paths get the mode-specific base/hash prefix.
  const href = (): string => {
    if (!isInternal()) return props.to
    const path = toRouterPath(props.to)
    // No router — emit the PLAIN path (native-anchor semantics, pairing with
    // the no-preventDefault click bail above). Pre-fix this fell back to
    // `#${path}`, which is wrong for history-mode apps (the dominant mode)
    // and a dead destination without a router to interpret the hash.
    if (!inst) return path
    return inst.mode === 'history' ? `${inst._base}${path}` : `#${path}`
  }

  // Auto target/rel for external links (overridable per-link). `_blank` gets a
  // secure `rel` by default (noopener stops window.opener hijacking).
  const linkTarget = (): string | undefined => {
    if (props.target !== undefined) return props.target
    if (isExternalNewTabEligible() && (inst?._linkConfig?.externalNewTab ?? true)) return '_blank'
    return undefined
  }
  const linkRel = (): string | undefined => {
    if (props.rel !== undefined) return props.rel
    if (linkTarget() === '_blank') return inst?._linkConfig?.externalRel ?? 'noopener noreferrer'
    return undefined
  }

  const isExactMatch = (): boolean => {
    if (!router) return false
    if (!isInternal()) return false
    const target = toRouterPath(props.to)
    if (typeof target !== 'string') return false
    return router.currentRoute().path === target
  }

  const activeClass = (): string => {
    if (!router || !isInternal()) return ''
    const current = router.currentRoute().path
    const target = toRouterPath(props.to)
    if (typeof target !== 'string') return ''
    const isExact = current === target
    const isActive = isExact || (!props.exact && isSegmentPrefix(current, target))

    const classes: string[] = []
    if (isActive) classes.push(props.activeClass ?? 'router-link-active')
    if (isExact) classes.push(props.exactActiveClass ?? 'router-link-exact-active')
    return classes.join(' ').trim()
  }

  const ariaCurrent = (): string | undefined => isExactMatch() ? 'page' : undefined

  // Viewport prefetching — observe link visibility with IntersectionObserver.
  //
  // Two refinements over the naive "fire prefetch the instant the link
  // intersects" shape:
  //
  //   1. `rootMargin: '200px'` — start the prefetch BEFORE the link is
  //      fully on screen. By the time the user scrolls to it and clicks,
  //      the loader data is typically already resolved. Matches the
  //      margin instant.page / Astro use; 0px (the previous default)
  //      only started the fetch once the link was already visible,
  //      leaving a window where a fast scroll-then-click still waited.
  //   2. Schedule the prefetch via `requestIdleCallback` so it never
  //      contends with active scrolling / paint. Prefetch is best-effort
  //      background work — running it in an idle slice keeps the main
  //      thread free for the scroll the user is actively performing.
  //      Falls back to a 1ms `setTimeout` where rIC is unavailable
  //      (Safari < 16.4, jsdom) so the behaviour degrades, not breaks.
  const ref = createRef<Element>()
  if (prefetchMode === 'viewport' && router && typeof IntersectionObserver !== 'undefined') {
    const ric = (
      globalThis as { requestIdleCallback?: (cb: () => void) => number }
    ).requestIdleCallback
    const scheduleIdle = (fn: () => void): void => {
      if (typeof ric === 'function') ric(fn)
      else setTimeout(fn, 1)
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            // Disconnect synchronously so a re-intersection (scroll
            // jitter) before the idle callback runs can't double-schedule.
            observer.disconnect()
            if (isInternal()) scheduleIdle(() => prefetchRoute(router as RouterInstance, toRouterPath(props.to)))
            break
          }
        }
      },
      { rootMargin: '200px' },
    )
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
    external: _external,
    target: _target,
    rel: _rel,
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
      target: linkTarget,
      rel: linkRel,
      class: mergedClass,
      'aria-current': ariaCurrent,
      onClick: handleClick,
      onMouseEnter: handleMouseEnter,
      onFocus: handleFocus,
    },
    children ?? props.to,
  )
}

/**
 * `<RouterLink>` — client-side navigation for internal routes, with automatic
 * external-link handling. Generic over the `to` literal so it validates against
 * the app's registered routes (typo → TS error + "did you mean …"), while still
 * accepting dynamic `string`s and external URLs. The runtime is
 * {@link RouterLinkImpl}; this const only refines the call signature.
 */
export const RouterLink = /* @__PURE__ */ nativeCompat(RouterLinkImpl) as {
  <const T extends string>(props: RouterLinkProps<T>): VNodeChild
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
        if (isClient && isStaleChunk(err)) {
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

  // Phase 5 — server-loader records carry data too (`serverLoader` is the
  // fn on the server graph; `hasServerLoader` is the client marker). Pre-
  // fix BOTH gates below checked only `record.loader`, so a server-loader
  // route rendered WITHOUT the LoaderDataProvider — useLoaderData() read
  // the context default (undefined) even though preload had populated
  // router._loaderData and the hydration blob carried the value. ONE
  // predicate for both branches so they can't drift again (the
  // errorComponent branch is the one EVERY zero route takes — fs-router
  // attaches a default errorComponent — and it was missed first).
  const carriesLoaderData =
    Boolean(record.loader) || Boolean(record.serverLoader) || record.hasServerLoader === true

  // If route has an error component, wrap rendering in error boundary
  if (record.errorComponent) {
    return h(ErrorBoundary, {
      fallback: (error: Error) => h(record.errorComponent!, { ...routeProps, error }),
      children: carriesLoaderData
        ? renderLoaderContent(router, record, Comp, routeProps)
        : h(Comp, routeProps),
    })
  }

  if (!carriesLoaderData) {
    return h(Comp, routeProps)
  }
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

/**
 * Persist a resolved component into the per-router cache. SizedMap.set
 * handles cap-enforced FIFO eviction internally — the cap is fixed at
 * `maxCacheSize` when the SizedMap was constructed in router.ts.
 */
function cacheSet(router: RouterInstance, record: RouteRecord, comp: ComponentFn): void {
  router._componentCache.set(record, comp)
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

// Mark router framework components as native — compat-mode jsx() runtimes
// (react/preact/vue/solid-compat) skip wrapCompatComponent for these so their
// provide() / useContext() / onUnmount() / effect() / IntersectionObserver
// setup runs inside Pyreon's lifecycle frame instead of the compat wrapper's
// runUntracked accessor.
// ASSIGNMENT + /* @__PURE__ */ form (not a bare statement): inside a built
// lib's shared chunk a bare `nativeCompat(X)` call is an unremovable side
// effect that RETAINS the component body in every consumer bundle that
// never imports it (see runtime-dom's native-compat-treeshake lock). The
// PURE call is droppable exactly when the export is unused; when used it
// returns the SAME fn with the marker applied.
const _RouterProvider = /* @__PURE__ */ nativeCompat(RouterProvider)
export { _RouterProvider as RouterProvider }
// ASSIGNMENT + /* @__PURE__ */ form (not a bare statement): inside a built
// lib's shared chunk a bare `nativeCompat(X)` call is an unremovable side
// effect that RETAINS the component body in every consumer bundle that
// never imports it (see runtime-dom's native-compat-treeshake lock). The
// PURE call is droppable exactly when the export is unused; when used it
// returns the SAME fn with the marker applied.
const _RouterView = /* @__PURE__ */ nativeCompat(RouterView)
export { _RouterView as RouterView }

// ─── DefaultChromeLayout ─────────────────────────────────────────────────────
//
// Synthetic layout used by the layout-less-app 404 fallback. When the user
// has a page-level `notFoundComponent` (`_404.tsx` at the route root without
// a wrapping `_layout.tsx`), `findNotFoundFallback` in match.ts synthesizes
// a chain `[DefaultChromeLayout, syntheticLeaf]` and the render pipeline
// produces 404 HTML wrapped in `<main data-pyreon-default-chrome>` instead
// of the bare component output.
//
// The wrapper is intentionally minimal:
//   - `<main>` provides a semantic landmark for accessibility and SEO.
//   - The `data-pyreon-default-chrome` attribute lets users target the
//     wrapper from CSS if they want to customize spacing / centering.
//   - No prescribed visual styling — the framework can't know the user's
//     design system, so we ship semantics only.
//
// Registered via the setter pattern (`_setDefaultChromeLayout`) instead of
// directly imported into match.ts to avoid a circular dependency: components.tsx
// depends transitively on match.ts (via router.ts), so match.ts can't import
// components.tsx without a cycle. The setter call runs at module load —
// every Pyreon app imports something from `./components.tsx` (RouterProvider,
// RouterView, RouterLink), which triggers the setter before any resolveRoute
// call can fire.
const DefaultChromeLayout: ComponentFn = () =>
  h('main', { 'data-pyreon-default-chrome': '' }, h(RouterView, null))

// ASSIGNMENT + /* @__PURE__ */ form (not a bare statement): inside a built
// lib's shared chunk a bare `nativeCompat(X)` call is an unremovable side
// effect that RETAINS the component body in every consumer bundle that
// never imports it (see runtime-dom's native-compat-treeshake lock). The
// PURE call is droppable exactly when the export is unused; when used it
// returns the SAME fn with the marker applied.
const _DefaultChromeLayout = /* @__PURE__ */ nativeCompat(DefaultChromeLayout)
export { _DefaultChromeLayout as DefaultChromeLayout }
// Register the PURE-call RESULT, not the bare `DefaultChromeLayout`. Under the
// `/* @__PURE__ */` sweep, a bundle that never imports the `DefaultChromeLayout`
// export can drop the `nativeCompat(...)` call — so registering the bare fn
// would retain the body (the setter is a live side effect) but WITHOUT the
// marker ever applied, silently registering an UNMARKED layout. Registering
// `_DefaultChromeLayout` keeps the PURE call live (the body is retained either
// way via this setter), so the marker is applied. Same object at runtime
// (nativeCompat mutates + returns its arg), so this is a pure correctness fix
// at zero bundle cost.
_setDefaultChromeLayout(_DefaultChromeLayout)
