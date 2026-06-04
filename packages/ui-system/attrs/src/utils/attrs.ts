import { isEmpty } from '@pyreon/ui-core'

// The reactive-prop-aware "drop undefined, keep getter descriptors" filter is
// a `@pyreon/core` primitive (it operates on core's own `_rp` / `makeReactiveProps`
// encoding). `@pyreon/attrs` and `@pyreon/rocketstyle` previously each hand-rolled
// it, and THIS copy historically shipped as a value-copy that silently broke
// reactive-prop forwarding for `attrs(Component)` consumers — exactly the bug a
// single canonical home prevents. Re-exported (not renamed) so call sites keep
// importing `removeUndefinedProps` from `../utils/attrs`.
export { removeUndefinedProps } from '@pyreon/core'

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
