import { onUnmount } from '@pyreon/core'
import { isServer } from '@pyreon/reactivity'

let lockCount = 0
let savedBodyOverflow = ''
let savedHtmlOverflow = ''
let savedPaddingRight = ''

/**
 * Lock page scroll. Uses reference counting for concurrent locks.
 * Returns an unlock function.
 */
export function useScrollLock(): { lock: () => void; unlock: () => void } {
  let isLocked = false

  const lock = () => {
    // SSR-safe: scroll locking is meaningless without a document. Guards
    // against accidental call from a non-browser context (e.g. SSR
    // rendering a component that opens a modal in its setup).
    /* v8 ignore next — SSR/isServer guard; tests run with happy-dom */
    if (isServer) return
    if (isLocked) return
    isLocked = true
    if (lockCount === 0) {
      const body = document.body
      const html = document.documentElement
      // Measured BEFORE hiding overflow: once the scrollbar is gone the page
      // widens by its width and every centred element jumps sideways.
      // Padding the body by that width keeps the layout still.
      const scrollbar = window.innerWidth - html.clientWidth
      savedBodyOverflow = body.style.overflow
      savedHtmlOverflow = html.style.overflow
      savedPaddingRight = body.style.paddingRight
      if (scrollbar > 0) {
        const current = Number.parseFloat(getComputedStyle(body).paddingRight) || 0
        body.style.paddingRight = `${current + scrollbar}px`
      }
      // `overflow: hidden` on <body> alone does not stop iOS Safari scrolling
      // the page; the root scroller is <html>, so lock both.
      body.style.overflow = 'hidden'
      html.style.overflow = 'hidden'
    }
    lockCount++
  }

  const unlock = () => {
    /* v8 ignore next — SSR/isServer guard; tests run with happy-dom */
    if (isServer) return
    if (!isLocked) return
    isLocked = false
    lockCount--
    if (lockCount === 0) {
      document.body.style.overflow = savedBodyOverflow
      document.documentElement.style.overflow = savedHtmlOverflow
      document.body.style.paddingRight = savedPaddingRight
    }
  }

  onUnmount(() => {
    if (isLocked) unlock()
  })

  return { lock, unlock }
}
