import { onMount, onUnmount } from "@pyreon/core"

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Trap Tab/Shift+Tab focus within a container element.
 */
export function useFocusTrap(getEl: () => HTMLElement | null): void {
  const listener = (e: KeyboardEvent) => {
    if (e.key !== "Tab") return
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

  onMount(() => {
    document.addEventListener("keydown", listener)
    return undefined
  })

  onUnmount(() => {
    document.removeEventListener("keydown", listener)
  })
}
