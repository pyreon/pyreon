import { isServer } from '@pyreon/reactivity'

/**
 * Politeness of a screen-reader announcement.
 * - `'polite'` (default) — queued, spoken when the user is idle. Use for
 *   status updates, "saved", route changes, search-result counts.
 * - `'assertive'` — interrupts the user immediately. Reserve for errors and
 *   time-critical alerts; overuse is hostile to screen-reader users.
 */
export type A11yPoliteness = 'polite' | 'assertive'

export interface AnnounceOptions {
  /** Politeness level (default `'polite'`). */
  politeness?: A11yPoliteness
  /**
   * Clear the live region this many ms after announcing. Useful when stale
   * text lingering in the DOM would be re-read by a screen reader that
   * navigates back into the region. Omit to leave the message in place.
   */
  clearAfter?: number
}

const SR_ONLY =
  'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0'

// One live region per politeness, created lazily on first announce and
// reused thereafter. Module-level so `announce()` works with zero setup —
// no provider, no <Announcer> to mount (the toast philosophy).
const regions: Partial<Record<A11yPoliteness, HTMLElement>> = {}

/**
 * Announce a message to screen-reader users via an `aria-live` region.
 *
 * Works with **zero setup** — no provider, no component to mount. The first
 * call lazily creates a visually-hidden live region on `document.body` and
 * reuses it. On the server it's a no-op (there is no live region to write to;
 * announcements are inherently client-side, user-triggered events).
 *
 * The region is cleared immediately and the message written on the next
 * frame, so two identical consecutive messages are still re-announced (an
 * unchanged `textContent` would otherwise be silent in many screen readers).
 *
 * @example
 * ```ts
 * import { announce } from '@pyreon/a11y'
 *
 * announce('Settings saved')                          // polite
 * announce('Connection lost', { politeness: 'assertive' })
 * announce('Copied to clipboard', { clearAfter: 1000 })
 * ```
 */
export function announce(message: string, options: AnnounceOptions = {}): void {
  if (isServer) return
  const { politeness = 'polite', clearAfter } = options
  // Lazily create (or reuse) the live region. All `document` access lives
  // under the `isServer` guard above, so this stays SSR-safe.
  const cached = regions[politeness]
  let region: HTMLElement
  if (cached && cached.isConnected) {
    region = cached
  } else {
    region = document.createElement('div')
    region.setAttribute('aria-live', politeness)
    region.setAttribute('aria-atomic', 'true')
    region.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status')
    region.setAttribute('data-pyreon-announcer', politeness)
    region.style.cssText = SR_ONLY
    document.body.appendChild(region)
    regions[politeness] = region
  }
  // Clear first so an identical repeat still registers as a change.
  region.textContent = ''
  requestAnimationFrame(() => {
    region.textContent = message
    if (clearAfter != null && clearAfter >= 0) {
      setTimeout(() => {
        if (region.textContent === message) region.textContent = ''
      }, clearAfter)
    }
  })
}

/**
 * Remove the lazily-created live regions from the DOM. Primarily for tests
 * and single-page teardown — application code rarely needs this, since the
 * regions are tiny, visually hidden, and reused across the page lifetime.
 */
export function clearAnnouncements(): void {
  for (const key of Object.keys(regions) as A11yPoliteness[]) {
    regions[key]?.remove()
    delete regions[key]
  }
}
