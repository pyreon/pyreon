/**
 * Build a props object by copying descriptors from `rest` and layering
 * static `overrides`. Used by Element / Text / Content (and Wrapper) to
 * bypass JSX object-spread for `<Styled {...rest} foo={x}>`, which the
 * automatic JSX runtime lowers to `jsx(Styled, { ...rest, foo: x })` —
 * a JS-level object literal that fires every getter on `rest` and stores
 * resolved values BEFORE the receiving component sees the object.
 *
 * Compiler-emitted reactive props (`_rp(() => signal())` converted to
 * getters by `makeReactiveProps`) carry their reactivity in a property
 * GETTER. The JSX spread collapses that getter to a static value at the
 * source-component layer, so any downstream consumer reads a frozen
 * snapshot, not a live subscription.
 *
 * `buildSpreadProps` uses `Object.defineProperty` to copy own
 * descriptors verbatim — getters stay getters. Then `h(Comp, result)`
 * stores the descriptor-preserving object on the vnode as-is (no copy),
 * and downstream `splitProps` / `makeReactiveProps` see the live
 * getters. End-to-end reactivity is preserved.
 *
 * Mirrors `helpers/Wrapper/component.tsx:buildStyledProps`. Extracted
 * into its own module so Element / Text / Content can share the same
 * descriptor-safe shape without duplicating the loop.
 *
 * @param rest        Source props object. Own descriptors are copied
 *                    onto the result via `Object.defineProperty`.
 * @param overrides   Static fields layered on top of `rest`. Plain
 *                    assignment is correct here because overrides are
 *                    framework-controlled values, never user-supplied
 *                    reactive props.
 */
export const buildSpreadProps = (
  rest: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> => {
  const result: Record<string, unknown> = {}
  const descriptors = Object.getOwnPropertyDescriptors(rest)
  for (const key in descriptors) {
    Object.defineProperty(result, key, descriptors[key]!)
  }
  for (const key in overrides) {
    result[key] = overrides[key]
  }
  return result
}
