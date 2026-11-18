/**
 * The ONE page scroll lock every package shares.
 *
 * Before this, `@pyreon/hooks` `useScrollLock` and `@pyreon/elements`
 * `useOverlay` (`type: 'modal'`) each kept their own counter over
 * `document.body.style.overflow`. Releasing one wrote over whatever the other
 * had saved or set, so a closing Overlay modal could unlock the page under an
 * open `ModalBase` dialog. It lives here, in core, because both depend on core
 * and `@pyreon/ui-system` packages may not depend on `@pyreon/fundamentals`.
 *
 * Contract: each `lockScroll()` call is one hold. The first hold on a target
 * saves its inline styles and locks it; the last release restores exactly what
 * was saved. A release function is idempotent (calling it twice releases one
 * hold, once). Entries are removed when their last hold is released, so the
 * registry holds nothing for an unlocked element.
 */
import { isServer } from '@pyreon/reactivity'

interface Hold {
  count: number
  overflow: string
  htmlOverflow: string
  paddingRight: string
}

// Keyed by the locked element. `null` = the page (document scroll). A Map
// rather than a WeakMap so the page key can be `null`; every entry is deleted
// on its last release.
const holds = new Map<HTMLElement | null, Hold>()

const NOOP = (): void => {}

/**
 * Lock scrolling and return the release function.
 *
 * - `lockScroll()` locks the PAGE: `overflow: hidden` on `<body>` and `<html>`
 *   (iOS Safari scrolls `<html>`), padding `<body>` by the scrollbar width so
 *   centred content does not shift.
 * - `lockScroll(element)` locks that element's own `overflow`.
 *
 * Holds are counted per target; the last release restores the inline values
 * the target had before the first hold. No-op on the server.
 *
 * @example
 * const release = lockScroll()
 * // … modal open …
 * release()
 */
export function lockScroll(element?: HTMLElement | null): () => void {
  /* v8 ignore next — SSR guard; the suite runs under happy-dom */
  if (isServer) return NOOP
  const key = element ?? null
  let hold = holds.get(key)
  if (hold === undefined) {
    if (key === null) {
      const body = document.body
      const html = document.documentElement
      // Measured BEFORE hiding overflow: once the scrollbar is gone the page
      // widens by its width and every centred element jumps sideways.
      const scrollbar = window.innerWidth - html.clientWidth
      hold = {
        count: 0,
        overflow: body.style.overflow,
        htmlOverflow: html.style.overflow,
        paddingRight: body.style.paddingRight,
      }
      if (scrollbar > 0) {
        const current = Number.parseFloat(getComputedStyle(body).paddingRight) || 0
        body.style.paddingRight = `${current + scrollbar}px`
      }
      body.style.overflow = 'hidden'
      html.style.overflow = 'hidden'
    } else {
      hold = { count: 0, overflow: key.style.overflow, htmlOverflow: '', paddingRight: '' }
      key.style.overflow = 'hidden'
    }
    holds.set(key, hold)
  }
  hold.count++
  const owned = hold
  let released = false
  return () => {
    if (released) return
    released = true
    owned.count--
    if (owned.count > 0) return
    holds.delete(key)
    if (key === null) {
      document.body.style.overflow = owned.overflow
      document.documentElement.style.overflow = owned.htmlOverflow
      document.body.style.paddingRight = owned.paddingRight
    } else {
      key.style.overflow = owned.overflow
    }
  }
}

/** @internal Test-only: number of targets currently locked. */
export function _scrollLockTargetCount(): number {
  return holds.size
}
