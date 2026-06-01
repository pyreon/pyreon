import { isEmpty } from '@pyreon/ui-core'

/**
 * Strips keys with `undefined` values from a props object.
 * This prevents undefined consumer props from overriding defaults
 * computed by `.attrs()` callbacks. Only explicitly set values
 * (including `null`) should override defaults.
 *
 * **Descriptor-copy contract** — uses
 * `Object.getOwnPropertyDescriptors(props)` + `Object.defineProperty`
 * to forward getter-shaped reactive props (`_rp(() => signal())`
 * brands that `makeReactiveProps` converts to property getters)
 * without firing them. A plain `result[key] = props[key]` value-copy
 * would fire each getter at HOC setup time, capture the resolved
 * value, and store it as a data property — collapsing the live
 * subscription to a one-shot snapshot. The downstream `applyProp` /
 * `_bind` then has nothing reactive to track. This is the same
 * contract `@pyreon/rocketstyle/src/utils/attrs.ts:removeUndefinedProps`
 * has held since PR #584; the `@pyreon/attrs` copy here was
 * historically value-copy and silently broke reactive-prop
 * forwarding for any consumer using `attrs(Component)` directly
 * (without rocketstyle wrapping).
 */
type RemoveUndefinedProps = <T extends Record<string, any>>(
  props: T,
) => { [I in keyof T as T[I] extends undefined ? never : I]: T[I] }

export const removeUndefinedProps = (<T extends Record<string, any>>(props: T) => {
  const result: Record<string, unknown> = {}
  const descriptors = Object.getOwnPropertyDescriptors(props)
  for (const key of Object.keys(descriptors)) {
    const d = descriptors[key] as PropertyDescriptor
    // Keep getter-shaped descriptors verbatim (reactive props). For data
    // descriptors, filter `value === undefined` (matches the previous
    // value-copy semantic — undefined values from consumers must not
    // shadow `.attrs()` defaults).
    if (d.get || d.value !== undefined) {
      Object.defineProperty(result, key, d)
    }
  }
  return result
}) as RemoveUndefinedProps

/**
 * Reduces an array of option functions (from chained `.attrs()` calls)
 * into a single merged result. Each function is called with `args`
 * (typically the current props) and its return value is merged
 * left-to-right via Object.assign — so later `.attrs()` calls
 * override earlier ones.
 *
 * Returns a curried function: first call binds the chain, second
 * call provides the arguments and executes the reduction.
 *
 * Uses `Object.assign` (not `mergeProps`) because `.attrs()`
 * callbacks always return freshly-constructed object literals — the
 * keys flowing through here are written by the callback as plain
 * data properties (no getters). The reactivity-preservation
 * concern only applies to props flowing IN from the consumer
 * (handled by `removeUndefinedProps` + `mergeProps` from `@pyreon/core`
 * in the HOC's prop-merge step).
 */
type OptionFunc<A> = (...arg: A[]) => Record<string, unknown>
type CalculateChainOptions = <A>(
  options?: OptionFunc<A>[],
) => (args: A[]) => ReturnType<OptionFunc<A>>

export const calculateChainOptions: CalculateChainOptions = (options) => (args) => {
  const result = {}
  if (!options || isEmpty(options)) return result

  return options.reduce((acc, item) => Object.assign(acc, item(...args)), {})
}
