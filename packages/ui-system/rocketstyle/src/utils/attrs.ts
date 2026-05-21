import type { MultiKeys } from '../types/dimensions'

// --------------------------------------------------------
// remove undefined props
// --------------------------------------------------------
/**
 * Strips keys with `undefined` values so they don't shadow default props during merging.
 *
 * Copies own property DESCRIPTORS rather than values so that reactive
 * getter-shaped props (compiler-emitted `_rp(() => signal())` converted
 * to getters by `makeReactiveProps`) survive the pipeline with their
 * subscription intact. Reading `props[key]` here would fire the getter
 * at HOC setup time (outside any tracking scope) and collapse the prop
 * to a static value — every downstream JSX accessor that reads
 * `props.x` would see the captured-once value, not the live signal.
 *
 * For getter descriptors we keep the descriptor as-is (the
 * undefined-filter doesn't apply — we can't peek into the getter
 * without firing it). For data descriptors we drop entries whose
 * value is `undefined` to preserve the original merge semantics.
 */
type RemoveUndefinedProps = <T extends Record<string, any>>(props: T) => Partial<T>

export const removeUndefinedProps: RemoveUndefinedProps = (props) => {
  const result: Partial<typeof props> = {}
  const descriptors = Object.getOwnPropertyDescriptors(props)
  for (const key of Object.keys(descriptors)) {
    const d = descriptors[key]!
    if (d.get || d.value !== undefined) {
      Object.defineProperty(result, key, d)
    }
  }
  return result
}

// --------------------------------------------------------
// merge descriptors
// --------------------------------------------------------
/**
 * Like `Object.assign(target, ...sources)` but copies own property
 * DESCRIPTORS instead of reading + writing values. Later sources
 * override earlier ones (same semantics as spread / Object.assign).
 *
 * Required for reactive-prop preservation through the rocketstyle
 * pipeline: a plain `{ ...A, ...B }` spread fires every getter on A
 * and B and stores the resolved value, breaking the reactive
 * subscription. This helper copies descriptors so getters survive
 * the merge.
 */
export const mergeDescriptors = (
  ...sources: ReadonlyArray<Record<string, any> | null | undefined>
): Record<string, any> => {
  const result: Record<string, any> = {}
  for (const source of sources) {
    if (!source) continue
    const descriptors = Object.getOwnPropertyDescriptors(source)
    for (const key of Object.keys(descriptors)) {
      Object.defineProperty(result, key, descriptors[key]!)
    }
  }
  return result
}

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
      const pickedProp = props[item]
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
