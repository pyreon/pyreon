/**
 * Navigate between sibling elements of a given role using arrow keys.
 * Shared by TabBase (ArrowLeft/Right) and RadioBase (all arrows).
 *
 * @param e - The keyboard event
 * @param options - Configuration for navigation behavior
 * @returns The value of the activated element (from data-value attribute), or null
 */
export function navigateByRole(
  e: KeyboardEvent,
  options: {
    /** CSS selector for the container (e.g., '[role="tablist"]') */
    containerSelector: string
    /** CSS selector for navigable items (e.g., '[role="tab"]') */
    itemSelector: string
    /** Which arrow keys to listen for */
    keys: 'horizontal' | 'vertical' | 'both'
    /** Whether to activate (select) on focus */
    activateOnFocus?: boolean
  },
): string | null {
  const target = e.currentTarget as HTMLElement
  const container = target.closest(options.containerSelector) ?? target.parentElement
  if (!container) return null

  const items = Array.from(
    container.querySelectorAll(`${options.itemSelector}:not([aria-disabled="true"])`),
  ) as HTMLElement[]
  if (items.length === 0) return null

  const currentIndex = items.indexOf(target)
  if (currentIndex === -1) return null

  let nextIndex = -1
  const { keys } = options

  if ((keys === 'horizontal' || keys === 'both') && e.key === 'ArrowRight') {
    nextIndex = (currentIndex + 1) % items.length
  } else if ((keys === 'horizontal' || keys === 'both') && e.key === 'ArrowLeft') {
    nextIndex = (currentIndex - 1 + items.length) % items.length
  } else if ((keys === 'vertical' || keys === 'both') && e.key === 'ArrowDown') {
    nextIndex = (currentIndex + 1) % items.length
  } else if ((keys === 'vertical' || keys === 'both') && e.key === 'ArrowUp') {
    nextIndex = (currentIndex - 1 + items.length) % items.length
  } else if (e.key === 'Home') {
    nextIndex = 0
  } else if (e.key === 'End') {
    nextIndex = items.length - 1
  }

  if (nextIndex < 0) return null

  e.preventDefault()
  const nextItem = items[nextIndex]!
  nextItem.focus()
  return nextItem.getAttribute('data-value')
}
