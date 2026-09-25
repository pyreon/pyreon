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
 *
 * REACTIVE: every value handed to the provider is a GETTER that re-reads the
 * parent context and this component's props on access. Components run once, so
 * the previous shape — `const ctx = getCtx()` + an object spread at setup —
 * froze the parent's mode at mount: `<Provider inversed>` under a
 * `<PyreonUI mode={mode()}>` kept its first inverted value forever, and a
 * signal-driven `theme`/`mode` prop (a compiler getter) was resolved once. The
 * getters keep each read lazy, so a rocketstyle consumer reading `.mode` inside
 * its resolution computed subscribes to exactly the parent mode it depends on
 * (and reading only `.theme` never subscribes to mode — same contract as
 * `PyreonUI`'s own core-context getters).
 */
const Provider = (props: TProvider): VNodeChild => {
  const getCtx = useContext(context)
  // The provider COMPONENT is structural — which component renders is fixed
  // at mount, exactly like any other component choice.
  const FinalProvider = props.provider ?? CoreProvider

  const resolveMode = (): 'light' | 'dark' => {
    const mode = props.mode ?? getCtx().mode
    if (!mode) return MODE_DEFAULT
    return props.inversed ? THEME_MODES_INVERSED[mode] : mode
  }

  const result = FinalProvider({
    get mode() {
      return resolveMode()
    },
    get isDark() {
      return resolveMode() === 'dark'
    },
    get isLight() {
      return resolveMode() === 'light'
    },
    get theme() {
      return props.theme ?? getCtx().theme
    },
    provider: FinalProvider,
    get children() {
      return props.children
    },
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