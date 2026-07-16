// @pyreon/a11y/router — route-change announcements for screen-reader users.
//
// Single-page navigations are invisible to screen readers: the URL + DOM
// change but no page-load event fires, so assistive tech never announces "you
// are now on <page>". This is the canonical SPA accessibility gap.
// `<RouteAnnouncer>` (and the `useRouteAnnouncer()` hook) close it — they
// register ONE router `afterEach` hook that pushes the destination route's
// title to a polite `aria-live` region via the zero-setup `announce()`.
//
// Layering: `@pyreon/a11y` is a fundamentals package and MAY depend on
// `@pyreon/router` (core) — the correct direction (fundamentals → core). The
// router dependency lives ONLY in this `/router` subpath, so consumers who
// import just `announce` / `VisuallyHidden` / `createA11yId` from the main
// entry never pull the router into their bundle (the `@pyreon/i18n` vs
// `@pyreon/i18n/core` split precedent).

import { nativeCompat, onMount } from '@pyreon/core'
import { type ResolvedRoute, useRouter } from '@pyreon/router'
import { announce, type A11yPoliteness, type AnnounceOptions } from './announce'

export interface RouteAnnouncerOptions {
  /**
   * Build the announced string from the destination route. Return `null` /
   * `undefined` to skip announcing a given navigation. Default: the route's
   * `meta.title` when set, else `"Navigated to <path>"`.
   */
  format?: (to: ResolvedRoute, from: ResolvedRoute | null) => string | null | undefined
  /** Live-region politeness (default `'polite'`). */
  politeness?: A11yPoliteness
  /** Clear the announcement this many ms after it fires (see `announce`). */
  clearAfter?: number
  /**
   * Also announce the route present at mount time (default `false`). Usually
   * unwanted: on first load the screen reader already reads the freshly-loaded
   * page, so a redundant "Navigated to …" is noise. Enable it for apps where
   * the announcer mounts AFTER the initial navigation has already committed
   * (e.g. a deferred app shell).
   */
  announceInitial?: boolean
}

/** Default announced string: the route's configured title, else the path. */
function defaultMessage(to: ResolvedRoute): string {
  const title = to.meta.title
  return typeof title === 'string' && title.length > 0 ? title : `Navigated to ${to.path}`
}

/**
 * Announce client-side route changes to screen-reader users. Call once, from a
 * component that lives for the app's lifetime (typically the root layout).
 *
 * Registers a single router `afterEach` hook and announces via the zero-setup
 * `announce()` polite live region. SSR-safe — `announce()` no-ops on the
 * server, and the hook only registers in `onMount` (client only). The hook is
 * removed automatically when the owning component unmounts.
 *
 * @example
 * ```ts
 * useRouteAnnouncer()                                       // announces meta.title / path
 * useRouteAnnouncer({ format: (to) => `${to.meta.title ?? to.path} page` })
 * useRouteAnnouncer({ politeness: 'assertive', clearAfter: 1000 })
 * ```
 */
export function useRouteAnnouncer(options: RouteAnnouncerOptions = {}): void {
  const router = useRouter()
  onMount(() => {
    const { format, politeness = 'polite', clearAfter, announceInitial = false } = options
    const fire = (to: ResolvedRoute, from: ResolvedRoute | null): void => {
      const msg = format ? format(to, from) : defaultMessage(to)
      if (!msg) return
      // Build options conditionally — under `exactOptionalPropertyTypes` a
      // literal `{ clearAfter: undefined }` is not assignable to `clearAfter?: number`.
      const opts: AnnounceOptions = { politeness }
      if (clearAfter != null) opts.clearAfter = clearAfter
      announce(msg, opts)
    }
    if (announceInitial) fire(router.currentRoute(), null)
    return router.afterEach((to: ResolvedRoute, from: ResolvedRoute) => {
      fire(to, from)
    })
  })
}

/**
 * Component form of {@link useRouteAnnouncer} — renders nothing, announces
 * route changes for its mounted lifetime. Drop one near the router root.
 *
 * @example
 * ```tsx
 * <RouterProvider router={router}>
 *   <RouteAnnouncer />
 *   <RouterView />
 * </RouterProvider>
 * ```
 */
function RouteAnnouncer(props: RouteAnnouncerOptions = {}): null {
  useRouteAnnouncer(props)
  return null
}
// Marked native so the four compat-mode jsx() runtimes route it through
// `h()` directly — its `onMount` (in `useRouteAnnouncer`) must run in Pyreon's
// setup frame, not the compat wrapper's accessor, or the afterEach cleanup
// registers against the wrong scope.
// ASSIGNMENT + /* @__PURE__ */ form (not a bare statement): inside a built
// lib's shared chunk a bare `nativeCompat(X)` call is an unremovable side
// effect that RETAINS the component body in every consumer bundle that
// never imports it (see runtime-dom's native-compat-treeshake lock). The
// PURE call is droppable exactly when the export is unused; when used it
// returns the SAME fn with the marker applied.
const _RouteAnnouncer = /* @__PURE__ */ nativeCompat(RouteAnnouncer)
export { _RouteAnnouncer as RouteAnnouncer }