import type { VNodeChild } from '@pyreon/core'
import { useContext } from '@pyreon/core'
import { Provider as CoreProvider, context } from '@pyreon/ui-core'
import { MODE_DEFAULT, THEME_MODES_INVERSED } from '../constants'

type Theme = {
  rootSize: number
  breakpoints?: Record<string, number>
} & Record<string, unknown>

export type TProvider = {
  children: VNodeChild
  theme?: Theme | undefined
  mode?: 'light' | 'dark' | undefined
  inversed?: boolean | undefined
  provider?: ((props: Record<string, unknown>) => VNodeChild) | undefined
}

/**
 * Top-level theme and mode provider for rocketstyle components.
 * Reads the parent context, merges incoming props, and resolves
 * the active mode (with optional inversion for nested dark/light switching).
 *
 * In Pyreon, context is provided via provide() instead of React.Provider.
 */
const Provider = ({ provider = CoreProvider, inversed, ...props }: TProvider): VNodeChild => {
  const ctx = useContext<TProvider>(context)

  const { theme, mode, provider: RocketstyleProvider, children } = { ...ctx, ...props, provider }

  let newMode = MODE_DEFAULT

  if (mode) {
    newMode = inversed ? THEME_MODES_INVERSED[mode] : mode
  }

  const result = RocketstyleProvider({
    mode: newMode,
    isDark: newMode === 'dark',
    isLight: newMode === 'light',
    ...(theme !== undefined ? { theme } : {}),
    provider,
    children,
  })

  return result ?? null
}

export { context }

export default Provider
