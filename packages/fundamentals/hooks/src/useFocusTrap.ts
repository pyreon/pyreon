import { onMount } from '@pyreon/core'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Trap Tab/Shift+Tab focus within a container element.
 */
export function useFocusTrap(getEl: () => HTMLElement | null): void {
  // Listener defined inside `onMount` so its `document` references are
  // co-located with their browser-only registration.
  onMount(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const el = getEl()
      if (!el) return

      const focusable = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) return

      const first = focusable[0] as HTMLElement
      const last = focusable[focusable.length - 1] as HTMLElement

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', listener)
    return () => document.removeEventListener('keydown', listener)
  })
}
