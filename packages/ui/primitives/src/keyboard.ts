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

/**
 * WAI-ARIA typeahead match: given item labels, the accumulated search buffer,
 * and the current active index, return the index of the next item whose label
 * matches — or `-1` if none matches. Shared by ComboboxBase (listbox pattern)
 * and TreeBase (tree pattern) so "type a character to move focus" behaves
 * identically in both.
 *
 * Semantics follow the WAI-ARIA Authoring Practices + Radix/Downshift:
 * - When the buffer is a SINGLE character repeated (e.g. `"aaa"`, i.e. the user
 *   pressed the same key several times), it CYCLES to the next item starting
 *   with that character, searching from `currentIndex + 1`.
 * - Otherwise it matches the FULL buffer starting AT `currentIndex`, so
 *   continuing to type refines toward the same item.
 *
 * Matching is case-insensitive and prefix-based (`startsWith`). The search
 * wraps around the list. Pure — no DOM, no timers — so it's unit-testable.
 */
export function typeaheadMatch(
  labels: string[],
  buffer: string,
  currentIndex: number,
): number {
  if (!buffer || labels.length === 0) return -1
  const lower = buffer.toLowerCase()
  const allSame = [...lower].every((c) => c === lower[0])
  const search = allSame ? lower[0]! : lower
  // Same-char cycling starts AFTER the current item; multi-char refinement
  // starts AT it (so the current match survives a longer prefix).
  const from = allSame ? currentIndex + 1 : Math.max(currentIndex, 0)
  const n = labels.length
  for (let i = 0; i < n; i++) {
    const idx = (((from + i) % n) + n) % n
    if (labels[idx]!.toLowerCase().startsWith(search)) return idx
  }
  return -1
}

/**
 * Per-instance typeahead buffer manager for list/tree keyboard navigation
 * (the WAI-ARIA "type a character to move focus to the next item that begins
 * with the typed characters" pattern). The buffer accumulates printable
 * characters and resets after `resetMs` of idle (default 500ms — the APG
 * reference value), so a fresh burst of typing starts a new search.
 *
 * Create ONE per primitive instance (closure-scoped state). Real `setTimeout`
 * is used deliberately (fake timers cause subtle test issues — see
 * `.claude/rules/testing.md`). The pending timer holds only a string closure
 * and self-clears, so an unmount mid-buffer is harmless.
 */
export function createTypeahead(resetMs = 500): {
  /**
   * Record a printable character. Returns the accumulated buffer to match
   * against, or `null` when `key` is not a single printable character (the
   * caller should have already filtered modifier chords).
   */
  push: (key: string) => string | null
  /** Reset the buffer immediately (e.g. on Escape / blur). */
  clear: () => void
} {
  let buffer = ''
  let timer: ReturnType<typeof setTimeout> | undefined

  function clearTimer() {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  return {
    push(key: string): string | null {
      // Single printable character only. Modifier chords (Ctrl/Meta/Alt) are
      // the caller's responsibility to exclude before calling.
      if (key.length !== 1) return null
      buffer += key
      clearTimer()
      timer = setTimeout(() => {
        buffer = ''
        timer = undefined
      }, resetMs)
      return buffer
    },
    clear() {
      buffer = ''
      clearTimer()
    },
  }
}
