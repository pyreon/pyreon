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
import { createReactiveContext, provide, useContext } from '@pyreon/core'

export interface DefaultTheme {}

type Theme = DefaultTheme & Record<string, unknown>

/**
 * Reactive theme context. Consumers get `() => Theme` from useContext.
 *
 * The DIFFERENCE from PR #258: styled components read the theme accessor
 * inside a COMPUTED (not an effect). The computed tracks theme + mode +
 * dimensions simultaneously, and the resolve itself runs untracked.
 * This gives reactive theme/mode/dimension switching with:
 * - Zero per-component effect()
 * - One lightweight computed per component
 * - String-equality memoization (same CSS class = no DOM update)
 * - Untracked resolve (no exponential cascade)
 */
export const ThemeContext = createReactiveContext<Theme>({} as Theme)

/**
 * Read the current theme. Returns the theme value (calls the accessor).
 * Inside a reactive scope (computed/effect), this tracks theme changes.
 */
export const useTheme = <T extends object = Theme>(): T => useContext(ThemeContext)() as T

/**
 * Returns the raw `() => Theme` accessor for use inside computeds
 * where you need explicit control over when the read happens.
 */
export const useThemeAccessor = <T extends object = Theme>(): (() => T) =>
  useContext(ThemeContext) as () => T

/**
 * @internal Low-level provider — use `PyreonUI` from `@pyreon/ui-core` instead.
 * @deprecated Prefer `<PyreonUI theme={theme}>`
 */
export function ThemeProvider({
  theme,
  children,
}: {
  theme: Theme
  children?: VNodeChild
}): VNode | null {
  provide(ThemeContext, () => theme)
  return (children ?? null) as VNode | null
}
