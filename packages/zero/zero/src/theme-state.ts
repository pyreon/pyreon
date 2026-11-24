// Test-reset hook for `initTheme()`'s refcount, split out of the
// `@pyreon/zero/theme` entry so the reset is not public API (it is on
// `@pyreon/zero/internal`). The refcount itself stays in `theme.tsx`, which
// registers the closure that resets it when it loads — one slot, replaced
// (never accumulated) on re-evaluation.

let resetInitTheme: (() => void) | null = null

/** Called once by `theme.tsx` at module load. */
export function setInitThemeReset(reset: () => void): void {
  resetInitTheme = reset
}

/**
 * Reset the refcount + shared teardown. Test-only. A no-op when `theme.tsx`
 * has not loaded (nothing to reset).
 */
export function _resetInitThemeForTests(): void {
  resetInitTheme?.()
}
