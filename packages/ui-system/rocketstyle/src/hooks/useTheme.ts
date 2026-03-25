import { useContext } from "@pyreon/core"
import { THEME_MODES_INVERSED } from "../constants"
import { context } from "../context/context"
import type { ThemeModeKeys } from "../types/theme"

type Context = {
  theme: Record<string, unknown>
  mode: ThemeModeKeys
  isDark: boolean
  isLight: boolean
}

type UseThemeAttrs = ({ inversed }: { inversed?: boolean | undefined }) => Context

/**
 * Retrieves the current theme object and resolved mode from context.
 * Supports mode inversion so nested components can flip between
 * light and dark without a new provider.
 *
 * In Pyreon, components run once — no useMemo needed.
 */
const useThemeAttrs: UseThemeAttrs = ({ inversed }) => {
  const {
    theme = {},
    mode: ctxMode = "light",
    isDark: ctxDark,
  } = useContext<Context>(context) || {}

  const mode = inversed ? THEME_MODES_INVERSED[ctxMode] : ctxMode
  const isDark = inversed ? !ctxDark : ctxDark
  const isLight = !isDark

  return { theme, mode, isDark, isLight }
}

export default useThemeAttrs
