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
 * Reactive theme context. Consumers receive `() => Theme` from
 * `useContext(ThemeContext)`; calling the accessor inside a reactive scope
 * (effect / computed / JSX accessor) tracks theme changes, so swapping the
 * provided theme re-resolves CSS and swaps class names without remounting.
 *
 * `useTheme()` wraps this: calls the accessor and returns `Theme`. Inside
 * a component body the read is a snapshot; inside an effect it tracks.
 * For explicit reactive reads (e.g. inside a resolver effect), prefer
 * `useThemeAccessor()` which returns the raw `() => Theme`.
 */
export const ThemeContext = createReactiveContext<Theme>({} as Theme)

/**
 * Hook to read the current theme from the nearest ThemeProvider.
 *
 * Returns a `Theme` snapshot at call time. When called inside a reactive
 * scope (effect, computed, JSX accessor), subsequent theme swaps re-run
 * the surrounding scope. When called in a static body, returns the theme
 * at that moment — use `useThemeAccessor()` if you need to re-read later.
 */
export const useTheme = <T extends object = Theme>(): T => useContext(ThemeContext)() as T

/** Returns the raw `() => Theme` accessor. Call inside effects for tracking. */
export const useThemeAccessor = <T extends object = Theme>(): (() => T) =>
  useContext(ThemeContext) as () => T

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
  // Reactive context expects an accessor. Static theme still works — the
  // accessor just returns the same value every call.
  provide(ThemeContext, () => theme)
  return (children ?? null) as VNode | null
}
