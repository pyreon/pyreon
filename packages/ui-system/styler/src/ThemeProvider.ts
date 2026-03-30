/**
 * Theme context for styled components.
 *
 * Extensible theme interface. Consumers can augment this via module
 * declaration merging for full strict types:
 *
 *   declare module '@pyreon/styler' {
 *     interface DefaultTheme {
 *       colors: { primary: string; secondary: string }
 *       spacing: (n: number) => string
 *     }
 *   }
 */
import type { VNode, VNodeChild } from '@pyreon/core'
import { createContext, provide, useContext } from '@pyreon/core'

// biome-ignore lint/suspicious/noEmptyInterface: augmentable via module declaration merging
export interface DefaultTheme {}

type Theme = DefaultTheme & Record<string, unknown>

export const ThemeContext = createContext<Theme>({} as Theme)

/** Hook to read the current theme from the nearest ThemeProvider. */
export const useTheme = <T extends object = Theme>(): T => useContext(ThemeContext) as T

/**
 * @internal Low-level provider — use `PyreonUI` from `@pyreon/ui-core` instead.
 *
 * Provides a theme object to all nested styled components via Pyreon context.
 *
 * @deprecated Prefer `<PyreonUI theme={theme}>` which provides theme to
 * all three context layers (styler, core, mode) in one component.
 */
export function ThemeProvider({
  theme,
  children,
}: {
  theme: Theme
  children?: VNodeChild
}): VNode | null {
  provide(ThemeContext, theme)
  return (children ?? null) as VNode | null
}
