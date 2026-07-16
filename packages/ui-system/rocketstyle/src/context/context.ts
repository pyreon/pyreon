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

  // `RocketstyleProvider` is `merged.provider`, which is always set: the
  // destructure defaults `provider` to `CoreProvider` and re-adds it to
  // `merged` after `...props` (which no longer carries `provider`). The
  // `?? CoreProvider` fallback is therefore defensive and never taken.
  /* v8 ignore next 2 */
  const FinalProvider =
    RocketstyleProvider ?? CoreProvider
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

export { context }

// ASSIGNMENT + /* @__PURE__ */ form (not a bare statement): inside a built
// lib's shared chunk a bare `nativeCompat(X)` call is an unremovable side
// effect that RETAINS the component body in every consumer bundle that
// never imports it (see runtime-dom's native-compat-treeshake lock). The
// PURE call is droppable exactly when the export is unused; when used it
// returns the SAME fn with the marker applied.
export default /* @__PURE__ */ nativeCompat(Provider)