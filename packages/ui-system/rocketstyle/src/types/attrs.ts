import type { render } from '@pyreon/ui-core'
import type { ThemeModeKeys } from './theme'

/** Helpers object passed as the 3rd arg to every `.attrs(callback)`. */
export type AttrsHelpers = {
  mode?: ThemeModeKeys
  isDark?: boolean
  isLight?: boolean
  createElement: typeof render
}

/**
 * Callback signature for `.attrs((props, theme, helpers) => …)`.
 *
 * `Partial<A>` on the return is for the strict-typing form when callers
 * pass `AttrsCb<DFP, Theme<T>>` directly. In the rocketstyle `.attrs()`
 * callback overload itself we use a different shape that decouples the
 * props arg (narrow, full DFP) from the return type (loose — only the
 * user's explicit `<P>` generic is checked, with `Record<string,
 * unknown>` allowing runtime extras like `_documentProps`). See
 * `IRocketStyleComponent.attrs` for the call-site shape.
 */
export type AttrsCb<A, T> = (props: Partial<A>, theme: T, helpers: AttrsHelpers) => Partial<A>
