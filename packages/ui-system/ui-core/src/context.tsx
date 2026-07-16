import type { VNodeChild } from '@pyreon/core'
import { createReactiveContext, nativeCompat, provide } from '@pyreon/core'
import isEmpty from './isEmpty'
import type { Breakpoints } from './types'

/**
 * Core context value shared across all @pyreon UI packages.
 */
export interface CoreContextValue {
  theme: Record<string, unknown>
  mode: 'light' | 'dark'
  isDark: boolean
  isLight: boolean
}

/**
 * Internal reactive context shared across all @pyreon packages.
 * Carries the theme object, mode, and derived dark/light flags.
 *
 * ReactiveContext means useContext() returns `() => CoreContextValue`.
 */
const context = createReactiveContext<CoreContextValue>({
  theme: {},
  mode: 'light',
  isDark: false,
  isLight: true,
})

type Theme = Partial<
  {
    rootSize: number
    breakpoints: Breakpoints
  } & Record<string, any>
>

type ProviderType = Partial<
  {
    theme: Theme
    children: VNodeChild
  } & Record<string, any>
>

/**
 * @internal Low-level provider — use `PyreonUI` from `@pyreon/ui-core` instead.
 *
 * Provider that feeds the internal Pyreon context with the theme.
 * When no theme is supplied, renders children directly.
 *
 * @deprecated Prefer `<PyreonUI theme={theme}>` which handles all context layers.
 */
function Provider({ theme, children, ...props }: ProviderType): VNodeChild {
  /* v8 ignore next 5 — dev-only warning gate; production NODE_ENV branch not exercised in tests */
  if (process.env.NODE_ENV !== 'production') {
    // oxlint-disable-next-line no-console
    console.warn(
      '[Pyreon] CoreProvider is internal. Use <PyreonUI theme={theme}> instead — it handles all context layers (styler, core, mode) in one component.',
    )
  }
  if (isEmpty(theme) || !theme) return children ?? null

  provide(context, () => ({
    theme: theme as Record<string, unknown>,
    mode: (props.mode as 'light' | 'dark') ?? 'light',
    isDark: props.isDark as boolean ?? false,
    isLight: props.isLight as boolean ?? true,
    ...props,
  }))

  return children ?? null
}

// Mark as native — even though @internal, PyreonUI invokes this internally
// AND the JSX inside PyreonUI's body still routes through the active jsx()
// runtime (which is the compat one in compat-mode apps). Without the marker,
// CoreProvider's body runs inside the compat wrapper's runUntracked and its
// provide() call is swallowed.

export { context }

// ASSIGNMENT + /* @__PURE__ */ form (not a bare statement): inside a built
// lib's shared chunk a bare `nativeCompat(X)` call is an unremovable side
// effect that RETAINS the component body in every consumer bundle that
// never imports it (see runtime-dom's native-compat-treeshake lock). The
// PURE call is droppable exactly when the export is unused; when used it
// returns the SAME fn with the marker applied.
export default /* @__PURE__ */ nativeCompat(Provider)