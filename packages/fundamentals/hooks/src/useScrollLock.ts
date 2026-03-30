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
    if (isLocked) return
    isLocked = true
    if (lockCount === 0) {
      savedOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    lockCount++
  }

  const unlock = () => {
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
