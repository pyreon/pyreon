import { useTheme } from '@pyreon/styler'
import { get } from './utils'

export type UseThemeValue = <T = unknown>(path: string) => T | undefined

/**
 * Deep-reads a value from the current theme by dot-separated path.
 *
 * Lives in `@pyreon/ui-core` (the base of the ui-system layer) so the
 * ui-system owns its theme-reader hooks without reaching into the
 * `@pyreon/hooks` fundamentals package.
 *
 * @example
 * ```ts
 * const primary = useThemeValue<string>('colors.primary')
 * const columns = useThemeValue<number>('grid.columns')
 * ```
 */
export const useThemeValue: UseThemeValue = (path) => {
  const theme = useTheme()
  /* v8 ignore next — defensive no-theme guard; ThemeContext default is `{}`, so falsy is unreachable in practice */
  if (!theme) return undefined
  return get(theme, path)
}

export default useThemeValue
