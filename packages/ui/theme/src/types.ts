import type { ColorScale } from '@pyreon/ui-tokens'

/** Mode-aware value — resolves differently in light vs dark mode. */
export type ModeValue<T> = { light: T; dark: T }

/** A value that may be mode-aware or static. */
export type ModeAware<T> = T | ModeValue<T>

/** Semantic color aliases — resolved per mode. */
export interface SemanticColors {
  bg: ModeValue<string>
  bgSubtle: ModeValue<string>
  bgMuted: ModeValue<string>
  text: ModeValue<string>
  textMuted: ModeValue<string>
  textSubtle: ModeValue<string>
  border: ModeValue<string>
  borderMuted: ModeValue<string>
  ring: ModeValue<string>
}

/** Full theme configuration. */
export interface ThemeConfig {
  colors: {
    primary: ColorScale
    secondary: ColorScale
    error: ColorScale
    warning: ColorScale
    success: ColorScale
    info: ColorScale
    gray: ColorScale
    [key: string]: ColorScale
  }
  semantic: SemanticColors
  fontFamily: { sans: string; mono: string }
  fontSize: { xs: number; sm: number; md: number; lg: number; xl: number; '2xl': number; '3xl': number; '4xl': number; '5xl': number; [key: string]: number }
  fontWeight: { normal: number; medium: number; semibold: number; bold: number; [key: string]: number }
  lineHeight: { tight: number; normal: number; relaxed: number; [key: string]: number }
  spacing: { 0: number; 0.5: number; 1: number; 1.5: number; 2: number; 2.5: number; 3: number; 3.5: number; 4: number; 5: number; 6: number; 7: number; 8: number; 9: number; 10: number; 12: number; 14: number; 16: number; 20: number; 24: number; [key: number]: number }
  radii: { none: number; sm: number; md: number; lg: number; xl: number; '2xl': number; '3xl': number; full: number; [key: string]: number }
  shadows: { xs: string; sm: string; md: string; lg: string; xl: string; '2xl': string; none: string; [key: string]: string }
  transition: { fast: string; normal: string; slow: string; [key: string]: string }
}

/** Deep partial for theme overrides. */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}
