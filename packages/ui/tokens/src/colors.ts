/** Color shade scale — 11 steps from lightest (50) to darkest (950). */
export interface ColorScale {
  readonly 50: string
  readonly 100: string
  readonly 200: string
  readonly 300: string
  readonly 400: string
  readonly 500: string
  readonly 600: string
  readonly 700: string
  readonly 800: string
  readonly 900: string
  readonly 950: string
}

function scale(
  s50: string,
  s100: string,
  s200: string,
  s300: string,
  s400: string,
  s500: string,
  s600: string,
  s700: string,
  s800: string,
  s900: string,
  s950: string,
): ColorScale {
  return { 50: s50, 100: s100, 200: s200, 300: s300, 400: s400, 500: s500, 600: s600, 700: s700, 800: s800, 900: s900, 950: s950 }
}

// ─── Neutral ─────────────────────────────────────────────────────────────────

export const gray = scale(
  '#f9fafb', '#f3f4f6', '#e5e7eb', '#d1d5db', '#9ca3af',
  '#6b7280', '#4b5563', '#374151', '#1f2937', '#111827', '#030712',
)

export const slate = scale(
  '#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8',
  '#64748b', '#475569', '#334155', '#1e293b', '#0f172a', '#020617',
)

// ─── Primary ─────────────────────────────────────────────────────────────────

export const blue = scale(
  '#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa',
  '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a', '#172554',
)

// ─── Semantic ────────────────────────────────────────────────────────────────

export const red = scale(
  '#fef2f2', '#fee2e2', '#fecaca', '#fca5a5', '#f87171',
  '#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d', '#450a0a',
)

export const orange = scale(
  '#fff7ed', '#ffedd5', '#fed7aa', '#fdba74', '#fb923c',
  '#f97316', '#ea580c', '#c2410c', '#9a3412', '#7c2d12', '#431407',
)

export const amber = scale(
  '#fffbeb', '#fef3c7', '#fde68a', '#fcd34d', '#fbbf24',
  '#f59e0b', '#d97706', '#b45309', '#92400e', '#78350f', '#451a03',
)

export const green = scale(
  '#f0fdf4', '#dcfce7', '#bbf7d0', '#86efac', '#4ade80',
  '#22c55e', '#16a34a', '#15803d', '#166534', '#14532d', '#052e16',
)

export const teal = scale(
  '#f0fdfa', '#ccfbf1', '#99f6e4', '#5eead4', '#2dd4bf',
  '#14b8a6', '#0d9488', '#0f766e', '#115e59', '#134e4a', '#042f2e',
)

export const cyan = scale(
  '#ecfeff', '#cffafe', '#a5f3fc', '#67e8f9', '#22d3ee',
  '#06b6d4', '#0891b2', '#0e7490', '#155e75', '#164e63', '#083344',
)

export const violet = scale(
  '#f5f3ff', '#ede9fe', '#ddd6fe', '#c4b5fd', '#a78bfa',
  '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95', '#2e1065',
)

export const pink = scale(
  '#fdf2f8', '#fce7f3', '#fbcfe8', '#f9a8d4', '#f472b6',
  '#ec4899', '#db2777', '#be185d', '#9d174d', '#831843', '#500724',
)

export const rose = scale(
  '#fff1f2', '#ffe4e6', '#fecdd3', '#fda4af', '#fb7185',
  '#f43f5e', '#e11d48', '#be123c', '#9f1239', '#881337', '#4c0519',
)

// ─── Semantic aliases (default mappings) ─────────────────────────────────────

export const primary = blue
export const secondary = slate
export const error = red
export const warning = amber
export const success = green
export const info = cyan

/** All color palettes. */
export const colors = {
  gray,
  slate,
  blue,
  red,
  orange,
  amber,
  green,
  teal,
  cyan,
  violet,
  pink,
  rose,
  primary,
  secondary,
  error,
  warning,
  success,
  info,
} as const

export type ColorName = keyof typeof colors
