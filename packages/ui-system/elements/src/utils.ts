// `import.meta.env.DEV` is provided by Vite/Rolldown at build time and
// literal-replaced so prod bundles tree-shake the dev branch to zero bytes.
// Typed through a narrowing interface so downstream packages don't need
// `vite/client` in their tsconfigs to type-check this file transitively.
export const IS_DEVELOPMENT: boolean = process.env.NODE_ENV !== 'production'

/**
 * Returns true when any of `keys` is a GETTER-shaped own property on `obj`.
 *
 * The Pyreon compiler emits `<Comp prop={signal()}>` as `_rp(() => signal())`
 * and `makeReactiveProps` (mount pipeline) converts the brand into a property
 * getter — so "getter-shaped" is the runtime signature of a reactive prop.
 * `splitProps` / `mergeProps` / ui-core `pick` / `omit` all copy descriptors,
 * so the getter survives every framework prop hop and this scan stays valid
 * on `own` / `rest` halves.
 *
 * Used as the cheap setup-time discriminator for the two-path design in
 * Element / Wrapper / Content / Iterator / Util: NO getters (the dominant
 * static case) → the exact pre-existing fast path (interning + one-shot
 * renders, zero perf change); ≥1 getter → the reactive path (accessor-shaped
 * bundles / body accessors) so the prop stays live instead of freezing at
 * its first value.
 */
export const hasGetterProps = (obj: object, keys: readonly string[]): boolean => {
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(obj, key)
    if (descriptor && typeof descriptor.get === 'function') return true
  }
  return false
}

/**
 * Builds a props object whose listed keys are ENUMERABLE GETTERS backed by
 * the given accessors — the same shape `makeReactiveProps` produces for
 * compiler-emitted reactive props. Descriptor-preserving consumers
 * (`mergeProps`, `splitProps`, `h()` + mount, styler `buildProps`) keep the
 * getters live end-to-end, so a value read inside a reactive scope
 * re-fires the accessor.
 *
 * Used by Element's reactive layout path to thread live layout derivations
 * (direction / alignX / alignY / css …) into Wrapper / Content without
 * value-copying them at setup. `configurable: true` is mandatory — a later
 * `mergeProps` override of the same key must be able to redefine it (see
 * anti-patterns "Object.defineProperty without configurable: true").
 */
export const definePropsFromAccessors = (
  accessors: Record<string, () => unknown>,
  base?: Record<string, unknown>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = base ? { ...base } : {}
  for (const key of Object.keys(accessors)) {
    Object.defineProperty(out, key, {
      get: accessors[key]!,
      enumerable: true,
      configurable: true,
    })
  }
  return out
}
