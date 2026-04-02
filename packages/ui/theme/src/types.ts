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
  fontSize: Record<string, number>
  fontWeight: Record<string, number>
  lineHeight: Record<string, number>
  spacing: Record<number, number>
  radii: Record<string, number>
  shadows: Record<string, string>
  transition: Record<string, string>
}

/** Deep partial for theme overrides. */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}
