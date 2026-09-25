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

// One live region per politeness. Module-level so `announce()` works with
// zero setup — no provider, no <Announcer> to mount (the toast philosophy).
const regions: Partial<Record<A11yPoliteness, HTMLElement>> = {}

/**
 * How long a message waits before it is written into its region. Two reasons,
 * both from how screen readers observe live regions:
 *
 * 1. A region that is inserted and filled in the same moment is frequently not
 *    announced at all — the AT has to have seen the empty region first. The
 *    regions are created on the first call and the write is delayed, so even
 *    the very first announcement lands in a region that already exists.
 * 2. Several `announce()` calls in quick succession (an action that reports
 *    "Item added" and then "Cart total $12") used to overwrite each other:
 *    only the last write survived the frame. They are now QUEUED and written
 *    together, so none is lost.
 */
const ANNOUNCE_DELAY_MS = 100

interface Pending {
  messages: string[]
  timer: ReturnType<typeof setTimeout> | undefined
  clearAfter: number | undefined
  clearTimer: ReturnType<typeof setTimeout> | undefined
}

const pending: Record<A11yPoliteness, Pending> = {
  polite: { messages: [], timer: undefined, clearAfter: undefined, clearTimer: undefined },
  assertive: { messages: [], timer: undefined, clearAfter: undefined, clearTimer: undefined },
}

function ensureRegion(doc: Document, politeness: A11yPoliteness): HTMLElement {
  const cached = regions[politeness]
  if (cached && cached.isConnected) return cached
  const region = doc.createElement('div')
  region.setAttribute('aria-live', politeness)
  region.setAttribute('aria-atomic', 'true')
  region.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status')
  region.setAttribute('data-pyreon-announcer', politeness)
  region.style.cssText = SR_ONLY
  doc.body.appendChild(region)
  regions[politeness] = region
  return region
}

/**
 * Announce a message to screen-reader users via an `aria-live` region.
 *
 * Works with **zero setup** — no provider, no component to mount. The first
 * call creates the (visually hidden) polite AND assertive regions on
 * `document.body` and reuses them. On the server it's a no-op (there is no
 * live region to write to; announcements are inherently client-side,
 * user-triggered events).
 *
 * Messages are written ~100ms after the call. Messages announced together
 * (within that window, same politeness) are joined into one announcement
 * rather than overwriting each other, and the region is cleared first, so an
 * identical repeat is still re-announced.
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
  // Both regions up front — see ANNOUNCE_DELAY_MS for why a region must exist
  // before the first write into it.
  const doc = document
  ensureRegion(doc, 'polite')
  ensureRegion(doc, 'assertive')
  const region = ensureRegion(doc, politeness)
  const q = pending[politeness]
  q.messages.push(message)
  q.clearAfter = clearAfter
  if (q.timer !== undefined) return
  // Clear first so an identical repeat still registers as a change, and so a
  // pending clearAfter from an earlier message cannot wipe this one.
  if (q.clearTimer !== undefined) {
    clearTimeout(q.clearTimer)
    q.clearTimer = undefined
  }
  region.textContent = ''
  q.timer = setTimeout(() => {
    q.timer = undefined
    const text = q.messages.join(' ')
    q.messages = []
    // Re-resolved (not the region captured above): if it was detached while
    // the message waited, a fresh one is created rather than writing into a
    // node no screen reader can see.
    const target = ensureRegion(doc, politeness)
    target.textContent = text
    const after = q.clearAfter
    if (after != null && after >= 0) {
      q.clearTimer = setTimeout(() => {
        q.clearTimer = undefined
        if (target.textContent === text) target.textContent = ''
      }, after)
    }
  }, ANNOUNCE_DELAY_MS)
}

/**
 * Remove the live regions from the DOM and drop anything still queued.
 * Primarily for tests and single-page teardown — application code rarely
 * needs this, since the regions are tiny, visually hidden, and reused across
 * the page lifetime.
 */
export function clearAnnouncements(): void {
  for (const key of Object.keys(pending) as A11yPoliteness[]) {
    const q = pending[key]
    if (q.timer !== undefined) clearTimeout(q.timer)
    if (q.clearTimer !== undefined) clearTimeout(q.clearTimer)
    q.timer = undefined
    q.clearTimer = undefined
    q.messages = []
  }
  for (const key of Object.keys(regions) as A11yPoliteness[]) {
    regions[key]?.remove()
    delete regions[key]
  }
}
