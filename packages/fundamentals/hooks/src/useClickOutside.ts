import { onMount, onUnmount } from '@pyreon/core'

/**
 * Call handler when a click occurs outside the target element.
 *
 * Listens for `pointerdown` (capture phase) — ONE event per press for mouse,
 * touch and pen alike. It used to listen for both `mousedown` and
 * `touchstart`, and a touch tap dispatches BOTH (the compatibility mouse
 * event follows the touch), so every tap outside ran the handler twice — a
 * toggle-on-outside-click reopened what it had just closed.
 */
export function useClickOutside(getEl: () => HTMLElement | null, handler: () => void): void {
  const listener = (e: Event) => {
    const el = getEl()
    if (!el || el.contains(e.target as Node)) return
    handler()
  }

  onMount(() => {
    document.addEventListener('pointerdown', listener, true)
    return undefined
  })

  onUnmount(() => {
    document.removeEventListener('pointerdown', listener, true)
  })
}
