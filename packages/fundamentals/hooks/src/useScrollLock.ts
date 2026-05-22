import { onUnmount } from '@pyreon/core'
import { defineCrossModuleState } from '@pyreon/reactivity'

// Cross-module-instance shared lock state. Without sharing, two duplicate
// `@pyreon/hooks` instances each maintain a separate refcount and a
// separate `savedOverflow` — the original `body.style.overflow` is then
// restored prematurely when the FIRST instance's lockCount hits 0 while
// the SECOND instance still has active locks (scroll unexpectedly unlocks).
const _state = defineCrossModuleState<{ lockCount: number; savedOverflow: string }>(
  'pyreon-hooks/scroll-lock-state',
  () => ({ lockCount: 0, savedOverflow: '' }),
)

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
    if (_state.lockCount === 0) {
      _state.savedOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    _state.lockCount++
  }

  const unlock = () => {
    if (typeof document === 'undefined') return
    if (!isLocked) return
    isLocked = false
    _state.lockCount--
    if (_state.lockCount === 0) {
      document.body.style.overflow = _state.savedOverflow
    }
  }

  onUnmount(() => {
    if (isLocked) unlock()
  })

  return { lock, unlock }
}
