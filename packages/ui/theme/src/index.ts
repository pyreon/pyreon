export { default as theme, type Theme } from './theme'

// Augment rocketstyle's ThemeDefault so .theme()/.states()/.sizes()/.variants()
// callbacks receive fully typed `t` parameter matching our theme shape.
import type { Theme } from './theme'

declare module '@pyreon/rocketstyle' {
  interface ThemeDefault extends Theme {}
}
