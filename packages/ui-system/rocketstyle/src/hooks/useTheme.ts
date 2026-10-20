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

/** The reactive context accessor `useContext(context)` returns. */
type GetCtx = () => { theme?: Record<string, unknown>; mode?: ThemeModeKeys; isDark?: boolean }

type UseThemeAttrs = ({ inversed }: { inversed?: boolean | undefined }) => Context

/**
 * The theme attrs one component instance reads. A CLASS with prototype
 * getters rather than an object literal with accessors: `useTheme` runs per
 * rocketstyle component mount (twice with the attrs HOC), and creating a
 * four-getter object literal measured ~387ns on V8 / ~107ns on JSC against
 * ~11 / ~19ns for a class instance.
 *
 * Each getter still calls the reactive context accessor on EVERY access, so
 * reads inside an effect/computed keep tracking the theme context exactly as
 * before. The getters live on the prototype, so a `{ ...attrs }` spread does
 * not copy them — read the properties instead.
 */
class ThemeAttrs implements Context {
  #getCtx: GetCtx
  #inversed: boolean

  constructor(getCtx: GetCtx, inversed: boolean) {
    this.#getCtx = getCtx
    this.#inversed = inversed
  }

  get theme(): Record<string, unknown> {
    return this.#getCtx().theme ?? ({} as Record<string, unknown>)
  }

  get mode(): ThemeModeKeys {
    const ctxMode = this.#getCtx().mode ?? 'light'
    return this.#inversed ? THEME_MODES_INVERSED[ctxMode] : ctxMode
  }

  get isDark(): boolean {
    const ctxDark = this.#getCtx().isDark ?? false
    return this.#inversed ? !ctxDark : ctxDark
  }

  get isLight(): boolean {
    return !this.isDark
  }
}

/**
 * Retrieves the current theme object and resolved mode from context.
 *
 * Returns an object whose mode/isDark/isLight/theme are getters evaluated
 * lazily on each access. The context is a ReactiveContext, so useContext
 * returns `() => CoreContextValue`, and each getter calls it to keep
 * reactive tracking.
 */
const useThemeAttrs: UseThemeAttrs = ({ inversed }) =>
  new ThemeAttrs(useContext(context) as GetCtx, inversed === true)

export default useThemeAttrs
