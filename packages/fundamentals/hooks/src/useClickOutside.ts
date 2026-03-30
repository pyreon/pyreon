import { onMount, onUnmount } from '@pyreon/core'

/**
 * Call handler when a click occurs outside the target element.
 */
export function useClickOutside(getEl: () => HTMLElement | null, handler: () => void): void {
  const listener = (e: Event) => {
    const el = getEl()
    if (!el || el.contains(e.target as Node)) return
    handler()
  }

  onMount(() => {
    document.addEventListener('mousedown', listener, true)
    document.addEventListener('touchstart', listener, true)
    return undefined
  })

  onUnmount(() => {
    document.removeEventListener('mousedown', listener, true)
    document.removeEventListener('touchstart', listener, true)
  })
}
