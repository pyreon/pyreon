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
 * are evaluated lazily on each access. This supports reactive mode
 * switching via PyreonUI — when PyreonUI provides `get mode()` getters,
 * rocketstyle picks up changes on every styled component re-evaluation.
 *
 * Without getters, destructuring would capture the mode value once at
 * setup time, making theme switching permanently broken.
 */
const useThemeAttrs: UseThemeAttrs = ({ inversed }) => {
  // Keep the context object reference — read its properties lazily via getters.
  // PyreonUI provides { get mode() {...} } so each access re-evaluates.
  const ctx = useContext<Context>(context) || ({} as Partial<Context>)

  return {
    get theme() {
      return ctx.theme ?? ({} as Record<string, unknown>)
    },
    get mode() {
      const ctxMode = ctx.mode ?? 'light'
      return inversed ? THEME_MODES_INVERSED[ctxMode] : ctxMode
    },
    get isDark() {
      const ctxDark = ctx.isDark ?? false
      return inversed ? !ctxDark : ctxDark
    },
    get isLight() {
      const ctxDark = ctx.isDark ?? false
      const isDark = inversed ? !ctxDark : ctxDark
      return !isDark
    },
  }
}

export default useThemeAttrs
