import { useTheme } from '@pyreon/styler'
import { get } from '@pyreon/ui-core'

export type UseThemeValue = <T = unknown>(path: string) => T | undefined

/**
 * Deep-reads a value from the current theme by dot-separated path.
 *
 * @example
 * ```ts
 * const primary = useThemeValue<string>('colors.primary')
 * const columns = useThemeValue<number>('grid.columns')
 * ```
 */
export const useThemeValue: UseThemeValue = (path) => {
  const theme = useTheme()
  if (!theme) return undefined
  return get(theme, path)
}

export default useThemeValue
