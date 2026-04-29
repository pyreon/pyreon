/**
 * Compat-mode native-component marker.
 *
 * Pyreon ships compat layers (`@pyreon/{react,preact,vue,solid}-compat`) that
 * wrap every JSX-called component function to emulate that source framework's
 * render-on-state-change semantics. That wrapping is correct for user code
 * (the whole point of compat mode) but corrupts Pyreon framework components
 * — those manage their own reactivity via `provide()` / signals / lifecycle
 * hooks, and wrapping them runs their setup body inside the compat layer's
 * render context instead of Pyreon's, breaking `provide()` and
 * `onMount()` / `onUnmount()` calls.
 *
 * Framework components opt out of compat wrapping by setting a well-known
 * registry symbol (`Symbol.for('pyreon:native-compat')`) on the function.
 * The compat layer reads that symbol and routes marked components straight
 * through Pyreon's `h()` mount path. The symbol is registry-shared, so no
 * import direction between framework and compat is implied — both sides
 * reference the same global symbol via the helpers exported here.
 *
 * Audience: framework-package authors writing JSX components in `@pyreon/*`
 * packages whose setup body uses `provide()` / lifecycle hooks / signal
 * subscriptions. Wrap exported components with `nativeCompat()`. One line
 * per export site; zero runtime cost beyond a single property write at
 * module load.
 */

/**
 * The well-known registry symbol that marks a component as a Pyreon native
 * framework component. Compat layers check this symbol to decide whether to
 * skip their `wrapCompatComponent` call.
 *
 * Exported for advanced cases where a caller needs to test the marker
 * directly (most callers should use `isNativeCompat()`).
 */
export const NATIVE_COMPAT_MARKER: symbol = Symbol.for('pyreon:native-compat')

/**
 * Mark a Pyreon framework component as "self-managing" — compat layers will
 * skip their React/Vue/Solid/Preact-style wrapping and route the component
 * directly through Pyreon's mount path. Use on every `@pyreon/*` JSX
 * component whose setup body uses `provide()`, lifecycle hooks
 * (`onMount` / `onUnmount`), signal-driven reactivity, or any other Pyreon
 * native pattern that depends on the active component-setup frame.
 *
 * Idempotent: re-applying the marker is a no-op. Non-function inputs pass
 * through unchanged so callers don't have to typecheck before wrapping.
 *
 * @example
 *   import { nativeCompat, provide } from '@pyreon/core'
 *
 *   export const RouterView = nativeCompat(function RouterView(props) {
 *     provide(RouterContext, ...)
 *     return <div data-pyreon-router-view>{children}</div>
 *   })
 */
export function nativeCompat<T>(fn: T): T {
  if (typeof fn === 'function') {
    ;(fn as unknown as Record<symbol, boolean>)[NATIVE_COMPAT_MARKER] = true
  }
  return fn
}

/**
 * Read whether a component has been marked as a Pyreon native framework
 * component. Compat-layer code calls this from its `jsx()` to decide whether
 * to wrap or pass through.
 *
 * @example
 *   import { isNativeCompat } from '@pyreon/core'
 *
 *   if (isNativeCompat(type)) return h(type, props)
 *   return wrapCompatComponent(type)(props)
 */
export function isNativeCompat(fn: unknown): boolean {
  return (
    typeof fn === 'function' &&
    (fn as unknown as Record<symbol, boolean>)[NATIVE_COMPAT_MARKER] === true
  )
}
