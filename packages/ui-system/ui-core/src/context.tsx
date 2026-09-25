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
 * Low-level provider that feeds the internal Pyreon core context with the
 * theme + mode. When no theme is supplied, renders children directly.
 *
 * App code should use `<PyreonUI theme={theme}>`, which handles all context
 * layers. This provider is what `@pyreon/rocketstyle`'s public `Provider`
 * delegates to, so it is a SUPPORTED path, not an internal-only one — it
 * therefore does not warn (it used to log "CoreProvider is internal" on every
 * mount, including every `<Provider>` from rocketstyle, where the user did
 * nothing wrong).
 *
 * Props are read LAZILY: the provided value exposes getters over `props`, so a
 * getter-backed prop (a compiler `theme={sig()}` / `mode={sig()}`, or
 * rocketstyle's parent-following `inversed` mode) stays reactive for any
 * consumer that reads it inside a tracking scope. Reading only `.theme` never
 * subscribes to `.mode` (the same lazy-getter contract `PyreonUI` provides).
 */
function Provider(props: ProviderType): VNodeChild {
  // Whether this provider provides at all is decided once, at mount — the
  // same structural decision as before (an empty theme means "pass through").
  if (isEmpty(props.theme) || !props.theme) return props.children ?? null

  // Extra keys passed alongside theme/mode flow into the context value too
  // (previously via an object spread). Enumerated at setup; each is a getter.
  const extraKeys = Object.keys(props).filter(
    (k) =>
      k !== 'theme' &&
      k !== 'children' &&
      k !== 'mode' &&
      k !== 'isDark' &&
      k !== 'isLight' &&
      k !== 'provider',
  )

  provide(context, () => {
    const value = {
      get theme() {
        return props.theme as Record<string, unknown>
      },
      get mode() {
        return (props.mode as 'light' | 'dark' | undefined) ?? 'light'
      },
      get isDark() {
        return (props.isDark as boolean | undefined) ?? false
      },
      get isLight() {
        return (props.isLight as boolean | undefined) ?? true
      },
    } as CoreContextValue & Record<string, unknown>
    for (const k of extraKeys) {
      Object.defineProperty(value, k, { get: () => props[k], enumerable: true, configurable: true })
    }
    return value
  })

  return props.children ?? null
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