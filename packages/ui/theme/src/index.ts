export { default as theme, type Theme } from './theme'

// Augment rocketstyle's ThemeDefault so .theme()/.states()/.sizes()/.variants()
// callbacks receive fully typed `t` parameter matching our theme shape.
// Augment StylesDefault with ITheme so CSS property names are type-checked.
import '@pyreon/rocketstyle'
import type { ITheme } from '@pyreon/unistyle'
import type { Theme } from './theme'

declare module '@pyreon/rocketstyle' {
  interface ThemeDefault extends Theme {}
  interface StylesDefault extends ITheme {}
}
