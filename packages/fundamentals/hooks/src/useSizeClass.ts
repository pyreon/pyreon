import { computed } from '@pyreon/reactivity'
import { useMediaQuery } from './useMediaQuery'

/**
 * Returns the current horizontal size class as `'compact'` or `'regular'`
 * — the cross-platform analog of SwiftUI's `horizontalSizeClass` and
 * Android's width-based `WindowSizeClass`. A `'regular'` class means an
 * expanded (tablet / landscape / split-view) width where a two-pane or
 * side-by-side layout is appropriate; `'compact'` is a phone-width column.
 *
 * On the web it tracks a `(min-width: 600px)` media query — 600 CSS px is
 * the standard tablet / expanded-width breakpoint shared by both mobile
 * platforms — and updates reactively on resize / rotation.
 *
 * On native the PMTC compiler lowers `useSizeClass()` to a pure
 * environment read with **no runtime port** (same shape as
 * {@link useColorScheme}):
 * - iOS → `@Environment(\.horizontalSizeClass)`, mapped to the same
 *   `'compact' | 'regular'` string.
 * - Android → `LocalConfiguration.current.screenWidthDp >= 600`, so a
 *   configuration change (rotation / split-screen) recomposes it.
 *
 * @example
 * ```tsx
 * function Layout() {
 *   const sizeClass = useSizeClass()
 *   return <Stack>{sizeClass() === 'regular' ? <TwoPane /> : <SinglePane />}</Stack>
 * }
 * ```
 */
export function useSizeClass(): () => 'compact' | 'regular' {
  const wide = useMediaQuery('(min-width: 600px)')
  return computed(() => (wide() ? 'regular' : 'compact'))
}
