/**
 * Theme type augmentation for the showcase. Declares the shape of the
 * theme object passed to rocketstyle `.theme()` callbacks so `t.space.large`,
 * `t.color.dark.base`, etc. are type-safe.
 *
 * `ThemeDefault` is an empty interface in @pyreon/rocketstyle by design
 * (consumers augment it per-project, same pattern as styled-components).
 */

import type { ShowcaseTheme } from './theme'

declare module '@pyreon/rocketstyle' {
  interface ThemeDefault extends ShowcaseTheme {}
}
