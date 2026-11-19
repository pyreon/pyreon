import { lockScroll, onUnmount } from '@pyreon/core'

/**
 * Lock page scroll. Returns `lock` / `unlock` for this caller's one hold.
 *
 * The hold goes through `lockScroll` from `@pyreon/core` — the ONE page lock
 * shared with `@pyreon/elements` `useOverlay({ type: 'modal' })` — so locks
 * taken by different packages count together and the last release restores
 * the page's previous inline styles. Released automatically on unmount.
 */
export function useScrollLock(): { lock: () => void; unlock: () => void } {
  let release: (() => void) | null = null

  const lock = () => {
    if (release) return
    release = lockScroll()
  }

  const unlock = () => {
    if (!release) return
    const r = release
    release = null
    r()
  }

  onUnmount(unlock)

  return { lock, unlock }
}
