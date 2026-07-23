import type { MultiKeys } from '../types/dimensions'

// --------------------------------------------------------
// remove undefined props
// --------------------------------------------------------
// The reactive-prop-aware "drop undefined, keep getter descriptors" filter is a
// `@pyreon/core` primitive (it operates on core's own `_rp` / `makeReactiveProps`
// encoding) — re-exported here so the rocketstyle attrs HOC keeps importing it
// from `../utils/attrs`. Previously hand-rolled identically in both this package
// and `@pyreon/attrs`; consolidating removes the divergence that let the attrs
// copy ship a value-copy reactivity bug.
export { removeUndefinedProps } from '@pyreon/core'

// --------------------------------------------------------
// pick styled props
// --------------------------------------------------------
/** Picks only the props whose keys exist in the dimension keywords lookup and have truthy values. */
export const pickStyledAttrs = <
  T extends Record<string, any>,
  K extends Record<string, true | undefined>,
>(
  props: T,
  keywords: K,
): { [I in keyof K & keyof T]: T[I] } => {
  // Direct `for...in` avoids the `Object.keys(props)` array allocation
  // that `for (const key of Object.keys(props))` paid on every render.
  // The hot path is rocketstyle's `EnhancedComponent` body — fires once
  // per render of every rocketstyle-wrapped component. Ported from
  // vitus-labs `00fdadc2`.
  const result: Record<string, unknown> = {}
  for (const key in props) {
    if (keywords[key] && props[key]) result[key] = props[key]
  }
  return result as { [I in keyof K & keyof T]: T[I] }
}

// --------------------------------------------------------
// combine values
// --------------------------------------------------------
/**
 * Returns a curried function that evaluates an array of `.attrs()` callbacks,
 * spreading each result into a single merged props object via `Object.assign`.
 */
type OptionFunc<A> = (...arg: A[]) => Record<string, unknown>
type CalculateChainOptions = <A>(
  options?: OptionFunc<A>[],
) => (args: A[]) => ReturnType<OptionFunc<A>>

export const calculateChainOptions: CalculateChainOptions = (options) => (args) => {
  if (!options || options.length === 0) return {}

  return options.reduce<Record<string, unknown>>(
    (acc, item) => Object.assign(acc, item(...args)),
    {},
  )
}

// --------------------------------------------------------
// get style attributes
// --------------------------------------------------------
/**
 * Resolves the active value for each styling dimension from component props.
 * First checks for explicit prop values (string, number, or array for multi-keys),
 * then falls back to boolean shorthand props when `useBooleans` is enabled.
 */
type CalculateStylingAttrs = ({
  useBooleans,
  multiKeys,
}: {
  useBooleans?: boolean
  multiKeys?: MultiKeys
}) => ({
  props,
  dimensions,
}: {
  props: Record<string, unknown>
  dimensions: Record<string, unknown>
}) => Record<string, any>
export const calculateStylingAttrs: CalculateStylingAttrs =
  ({ useBooleans, multiKeys }) =>
  ({ props, dimensions }) => {
    const result: Record<string, any> = {}

    // (1) find dimension keys values & initialize
    for (const item in dimensions) {
      // The Pyreon compiler emits an INLINE reactive dimension prop as a bare
      // accessor — `state={sig() ? 'a' : 'b'}` becomes `state: () => sig() ? …`
      // (unlike a `.map()`/helper-scoped prop, which stays a plain value). The
      // accessor is NOT `_rp`-branded, so `makeReactiveProps` leaves it a raw
      // function. Resolve it HERE — inside rocketstyle's reactive resolution
      // computed — so we read the string value AND track the signal (a dimension
      // flip re-resolves + re-classes with no remount). Without this, a function
      // fell through to `typeof !== 'string'` → `undefined` and the dimension
      // silently never applied for inline reactive props (active tab highlight,
      // signal-driven variant/size, etc.).
      const rawProp = props[item]
      const pickedProp = typeof rawProp === 'function' ? (rawProp as () => unknown)() : rawProp
      const t = typeof pickedProp

      if (multiKeys?.[item] && Array.isArray(pickedProp)) {
        result[item] = pickedProp
      } else if (t === 'string' || t === 'number') {
        result[item] = pickedProp
      } else {
        result[item] = undefined
      }
    }

    // (2) if booleans are being used let's find the rest
    // Use `in` operator on the dimension map instead of allocating
    // a new Set per dimension — the map is already an object with
    // the keywords as keys.
    if (useBooleans) {
      for (const key in result) {
        if (result[key]) continue // already assigned

        const dimensionMap = dimensions[key] as Record<string, unknown>
        const isMultiKey = multiKeys?.[key]
        let newDimensionValue: string | string[] | undefined

        if (isMultiKey) {
          const matches: string[] = []
          for (const propKey in props) {
            if (propKey in dimensionMap) matches.push(propKey)
          }
          newDimensionValue = matches.length > 0 ? matches : undefined
        } else {
          // Iterate props to find last matching keyword
          // (last wins for priority)
          for (const k in props) {
            if (k in dimensionMap && props[k]) {
              newDimensionValue = k
            }
          }
        }

        result[key] = newDimensionValue
      }
    }

    return result
  }
