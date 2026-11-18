/**
 * Theme context for styled components.
 *
 * Styler ships no provider component: `<PyreonUI theme={…}>` from
 * `@pyreon/ui-core` provides this context (enriched by unistyle). Low-level
 * code can call `provide(ThemeContext, () => theme)` directly.
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
import { createReactiveContext, useContext } from '@pyreon/core'

export interface DefaultTheme {}

type Theme = DefaultTheme & Record<string, unknown>

/**
 * Reactive theme context. Consumers get `() => Theme` from useContext.
 *
 * Styled components read the theme accessor inside a COMPUTED (not an
 * effect). The computed tracks theme + mode +
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
