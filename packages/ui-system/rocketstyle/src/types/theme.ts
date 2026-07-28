import type { THEME_MODES } from '../constants'
import type { Css } from './styles'
import type { MergeTypes } from './utils'

export interface ThemeDefault {}

/**
 * The theme a `.theme()` / dimension callback receives.
 *
 * The check is `unknown extends T`, NOT `T extends unknown`. Every type extends
 * `unknown` (it is the top type), so the original `T extends unknown ? … : …`
 * was DEGENERATE — always the true branch, so `Theme<T>` collapsed to the empty
 * `ThemeDefault` and the generic was silently discarded for every caller. That
 * is why passing a theme type never typed `t`, and why consumers reached for a
 * global `declare module` augmentation (which then merges into — and corrupts —
 * every other consumer's `t`) or a cast.
 *
 * Reversed, it means what it was meant to: no type argument (`T` is `unknown`)
 * → the augmentable `ThemeDefault`; a concrete `T` → that shape merged over it.
 */
export type Theme<T> = unknown extends T ? ThemeDefault : MergeTypes<[ThemeDefault, T]>

export type ThemeModeKeys = keyof typeof THEME_MODES

export type ThemeModeCallback = <A = any, B = any>(
  light: A,
  dark: B,
) => (mode: 'light' | 'dark') => A | B

export type ThemeMode = <A = any, B = any>(light: A, dark: B) => A | B

export type ThemeCb<CSS, T> = (theme: T, mode: ThemeModeCallback, css: Css) => Partial<CSS>
