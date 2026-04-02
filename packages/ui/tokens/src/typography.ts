/** Font family tokens. */
export const fontFamily = {
  sans: 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif',
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
} as const

/** Font size tokens in px. */
export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
  '5xl': 48,
} as const

/** Font weight tokens. */
export const fontWeight = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const

/** Line height tokens. */
export const lineHeight = {
  tight: 1.25,
  normal: 1.5,
  relaxed: 1.75,
} as const

/** Letter spacing tokens in em. */
export const letterSpacing = {
  tight: '-0.025em',
  normal: '0em',
  wide: '0.025em',
} as const

export type FontSize = keyof typeof fontSize
export type FontWeight = keyof typeof fontWeight
