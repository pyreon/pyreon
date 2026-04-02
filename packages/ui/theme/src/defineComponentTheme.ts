import type { ThemeConfig } from './types'
import type { ModeValue } from './types'

/** Mode-aware value constructor for component theme factories. */
export type ModeAwareFn = <T>(light: T, dark: T) => ModeValue<T>

/** A component theme factory — produces theme dimensions from global tokens. */
export interface ComponentThemeDef<T = Record<string, any>> {
  name: string
  factory: (tokens: ThemeConfig, m: ModeAwareFn) => T
}

/**
 * Define a component's theme as a function of global tokens.
 * This ensures all component styles derive from the theme — zero hardcoded values.
 *
 * @example
 * ```ts
 * export const buttonTheme = defineComponentTheme('Button', (t, m) => ({
 *   base: {
 *     fontSize: t.fontSize.sm,
 *     borderRadius: t.radii.md,
 *     focus: { boxShadow: `0 0 0 3px ${t.colors.primary[200]}` },
 *     disabled: { opacity: 0.5, cursor: 'not-allowed' },
 *   },
 *   states: {
 *     primary: {
 *       backgroundColor: m(t.colors.primary[500], t.colors.primary[600]),
 *       color: '#fff',
 *       hover: { backgroundColor: m(t.colors.primary[600], t.colors.primary[500]) },
 *     },
 *   },
 *   sizes: { sm: { paddingX: t.spacing[3] }, md: { paddingX: t.spacing[4] } },
 *   variants: { solid: {}, outline: { backgroundColor: 'transparent' } },
 * }))
 * ```
 */
export function defineComponentTheme<T>(
  name: string,
  factory: (tokens: ThemeConfig, m: ModeAwareFn) => T,
): ComponentThemeDef<T> {
  return { name, factory }
}
