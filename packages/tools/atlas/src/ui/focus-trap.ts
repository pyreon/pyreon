/**
 * Keep Tab inside a modal surface (the catalog drawer): Tab past the last
 * focusable element wraps to the first, ⇧Tab before the first wraps to the
 * last. Pure DOM, no listeners of its own — call it from the surface's
 * `onKeyDown`.
 */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function focusables(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true',
  )
}

export function trapTab(e: KeyboardEvent, container: HTMLElement): void {
  if (e.key !== 'Tab') return
  const items = focusables(container)
  if (items.length === 0) {
    e.preventDefault()
    return
  }
  const first = items[0]!
  const last = items[items.length - 1]!
  const active = container.ownerDocument.activeElement
  if (e.shiftKey && (active === first || active === container)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}
