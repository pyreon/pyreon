export { default as theme, type Theme } from './theme'

// Augment rocketstyle's ThemeDefault so .theme()/.states()/.sizes()/.variants()
// callbacks receive fully typed `t` parameter matching our theme shape.
// The import ensures tsc can find the module for augmentation.
import '@pyreon/rocketstyle'
import type { Theme } from './theme'

declare module '@pyreon/rocketstyle' {
  interface ThemeDefault extends Theme {}
}
