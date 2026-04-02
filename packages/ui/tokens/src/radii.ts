/** Border radius tokens in px. */
export const radii = {
  none: 0,
  sm: 2,
  md: 4,
  lg: 8,
  xl: 12,
  '2xl': 16,
  '3xl': 24,
  full: 9999,
} as const

export type RadiiKey = keyof typeof radii
