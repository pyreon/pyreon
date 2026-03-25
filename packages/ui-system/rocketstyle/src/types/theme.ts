import type { THEME_MODES } from "../constants"
import type { Css } from "./styles"
import type { MergeTypes } from "./utils"

// biome-ignore lint/suspicious/noEmptyInterface: this is an interface to be extended in consuming projects
export interface ThemeDefault {}

export type Theme<T> = T extends unknown ? ThemeDefault : MergeTypes<[ThemeDefault, T]>

export type ThemeModeKeys = keyof typeof THEME_MODES

export type ThemeModeCallback = <A = any, B = any>(
  light: A,
  dark: B,
) => (mode: "light" | "dark") => A | B

export type ThemeMode = <A = any, B = any>(light: A, dark: B) => A | B

export type ThemeCb<CSS, T> = (theme: T, mode: ThemeModeCallback, css: Css) => Partial<CSS>
