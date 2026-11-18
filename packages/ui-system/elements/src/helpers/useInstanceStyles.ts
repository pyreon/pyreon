import { useContext } from '@pyreon/core'
import { context } from '@pyreon/ui-core'
import type { StyleOverride, StylesMode, StylesProp, StylesThemeDefault } from '../types'
import { hasGetterProps } from '../utils'
import { internStyles } from './instanceStyles'

/**
 * Resolve the `styles` prop of one Element / Text instance to a reader.
 *
 * - Absent or a static object (the common cases): read once, interned
 *   (`internStyles`), so equal content shares one object and the bundle that
 *   carries it shares one class.
 * - A `(theme, mode) => object` callback, or a signal-driven prop (a getter):
 *   the reader re-evaluates on every call. The caller passes it as an accessor
 *   into the styled bundle, where the styler's class computed reads it
 *   TRACKED, so a signal, theme or mode change swaps the class on the same
 *   element (no remount).
 */
export const useInstanceStyles = (own: {
  styles?: StylesProp | undefined
}): (() => StyleOverride | undefined) => {
  if (!hasGetterProps(own, ['styles']) && typeof own.styles !== 'function') {
    const value = own.styles ? internStyles(own.styles) : undefined

    return () => value
  }

  const ctx = useContext(context)
  const mode: StylesMode = (light, dark) => (ctx().mode === 'dark' ? dark : light)

  return () => {
    const value = own.styles

    return typeof value === 'function' ? value(ctx().theme as StylesThemeDefault, mode) : value
  }
}
