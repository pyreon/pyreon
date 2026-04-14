import { onUnmount } from '@pyreon/core'

let lockCount = 0
let savedOverflow = ''

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
    if (typeof document === 'undefined') return
    if (isLocked) return
    isLocked = true
    if (lockCount === 0) {
      savedOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    lockCount++
  }

  const unlock = () => {
    if (typeof document === 'undefined') return
    if (!isLocked) return
    isLocked = false
    lockCount--
    if (lockCount === 0) {
      document.body.style.overflow = savedOverflow
    }
  }

  onUnmount(() => {
    if (isLocked) unlock()
  })

  return { lock, unlock }
}
