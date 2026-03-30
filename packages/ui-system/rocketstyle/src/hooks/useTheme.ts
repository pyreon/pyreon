import { useContext } from '@pyreon/core'
import { THEME_MODES_INVERSED } from '../constants'
import { context } from '../context/context'
import type { ThemeModeKeys } from '../types/theme'

type Context = {
  theme: Record<string, unknown>
  mode: ThemeModeKeys
  isDark: boolean
  isLight: boolean
}

type UseThemeAttrs = ({ inversed }: { inversed?: boolean | undefined }) => Context

/**
 * Retrieves the current theme object and resolved mode from context.
 *
 * Returns an object with getter properties so that mode/isDark/isLight
 * are evaluated lazily on each access. The context is a ReactiveContext,
 * so useContext returns `() => CoreContextValue` — we call it inside
 * each getter to ensure reactive tracking.
 */
const useThemeAttrs: UseThemeAttrs = ({ inversed }) => {
  // ReactiveContext: useContext returns () => CoreContextValue.
  // Call the getter inside each property getter for reactive tracking.
  const getCtx = useContext(context)

  return {
    get theme() {
      return getCtx().theme ?? ({} as Record<string, unknown>)
    },
    get mode() {
      const ctxMode = getCtx().mode ?? 'light'
      return inversed ? THEME_MODES_INVERSED[ctxMode] : ctxMode
    },
    get isDark() {
      const ctxDark = getCtx().isDark ?? false
      return inversed ? !ctxDark : ctxDark
    },
    get isLight() {
      const ctxDark = getCtx().isDark ?? false
      const isDark = inversed ? !ctxDark : ctxDark
      return !isDark
    },
  }
}

export default useThemeAttrs
