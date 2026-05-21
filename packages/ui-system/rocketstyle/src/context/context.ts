import type { VNodeChild } from '@pyreon/core'
import { nativeCompat, useContext } from '@pyreon/core'
import { Provider as CoreProvider, context } from '@pyreon/ui-core'
import { MODE_DEFAULT, THEME_MODES_INVERSED } from '../constants'

// Both `rootSize` and `breakpoints` are OPTIONAL — the rest of the chain
// handles their absence: `enrichTheme` defaults rootSize to 16,
// `makeItResponsive` short-circuits to plain CSS when breakpoints are
// empty, and `value()` defaults rootSize to 16 internally. Marking
// either as required here over-constrained user themes downstream
// (e.g. a minimal `{ colors: { primary: '#228be6' } }` theme passed
// to the public Provider was a TS error even though it works at runtime).
//
// Shape matches `@pyreon/unistyle` `PyreonTheme` and the downstream
// `@pyreon/ui-core` Provider's `Partial<...>`-wrapped theme — `?:` with
// no explicit `| undefined` so the downstream Partial composition holds
// under `exactOptionalPropertyTypes: true`.
type Theme = {
  rootSize?: number
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
  const getCtx = useContext(context)
  const ctx = getCtx()

  const merged = { ...ctx, ...props, provider } as unknown as TProvider & Record<string, unknown>
  const { theme, mode, provider: RocketstyleProvider, children } = merged

  let newMode = MODE_DEFAULT

  if (mode) {
    newMode = inversed ? THEME_MODES_INVERSED[mode] : mode
  }

  const FinalProvider = RocketstyleProvider ?? CoreProvider
  const result = FinalProvider({
    mode: newMode,
    isDark: newMode === 'dark',
    isLight: newMode === 'light',
    ...(theme !== undefined ? { theme } : {}),
    provider,
    children,
  })

  return result ?? null
}

// Mark as native — reads useContext() and delegates to CoreProvider, both
// of which need Pyreon's setup frame.
nativeCompat(Provider)

export { context }

export default Provider
