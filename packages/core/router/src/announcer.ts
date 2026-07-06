/**
 * Route-change announcer for screen-reader users.
 *
 * SPA navigations swap content without a full page load, so assistive tech is
 * never told the "page" changed — the user is left with no feedback that
 * their click/link did anything. The fix (the Next.js / Remix / gov.uk
 * pattern) is a visually-hidden `aria-live="polite"` region that the router
 * writes the new page's name into on every navigation.
 *
 * This MIRRORS `@pyreon/a11y`'s `announce()` deliberately rather than importing
 * it: `@pyreon/router` is a `core`-layer package and `@pyreon/a11y` lives in
 * `fundamentals` (which depends on core, not the reverse) — importing it would
 * be a layer violation. The implementation is intentionally minimal (one
 * polite region, reused) and kept in sync with the a11y version by convention.
 */
import { isServer } from '@pyreon/reactivity'

const SR_ONLY =
  'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0'

const REGION_ATTR = 'data-pyreon-route-announcer'

let region: HTMLElement | null = null

/**
 * Announce a route change. Uses the new page's `document.title` (which
 * `@pyreon/head` has already updated by the time the router's `afterEach`
 * hook fires — after the DOM swap), falling back to `fallback` (the new
 * pathname) when the document has no title.
 *
 * The region is cleared first and the text written on the next frame, so two
 * navigations to same-titled pages still re-announce (an unchanged
 * `textContent` is silent in many screen readers). SSR no-op.
 *
 * All `document` access lives under the `isServer` guard — the region is
 * created lazily and inline (not a separate helper) so the SSR-safety is
 * statically obvious to both a reader and the `no-window-in-ssr` lint rule.
 */
export function announceRouteChange(fallback: string): void {
  if (isServer) return
  if (!region || !region.isConnected) {
    region = document.createElement('div')
    region.setAttribute('aria-live', 'polite')
    region.setAttribute('aria-atomic', 'true')
    region.setAttribute('role', 'status')
    region.setAttribute(REGION_ATTR, '')
    region.style.cssText = SR_ONLY
    document.body.appendChild(region)
  }
  const el = region
  const label = document.title || fallback
  // Clear first so an identical repeat still registers as a change.
  el.textContent = ''
  requestAnimationFrame(() => {
    el.textContent = label
  })
}

/**
 * Remove the lazily-created announcer region. For tests / SPA teardown; app
 * code rarely needs it (the region is tiny, hidden, and reused for the page's
 * lifetime).
 */
export function clearRouteAnnouncer(): void {
  region?.remove()
  region = null
}
