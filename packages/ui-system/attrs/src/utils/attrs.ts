import { isEmpty } from "@pyreon/ui-core";

/**
 * Strips keys with `undefined` values from a props object.
 * This prevents undefined consumer props from overriding defaults
 * computed by `.attrs()` callbacks. Only explicitly set values
 * (including `null`) should override defaults.
 */
type RemoveUndefinedProps = <T extends Record<string, any>>(
  props: T,
) => { [I in keyof T as T[I] extends undefined ? never : I]: T[I] };

export const removeUndefinedProps = (<T extends Record<string, any>>(props: T) =>
  Object.keys(props).reduce<Record<string, unknown>>((acc, key) => {
    const currentValue = props[key];
    if (currentValue !== undefined) acc[key] = currentValue;
    return acc;
  }, {})) as RemoveUndefinedProps;

/**
 * Reduces an array of option functions (from chained `.attrs()` calls)
 * into a single merged result. Each function is called with `args`
 * (typically the current props) and its return value is merged
 * left-to-right via Object.assign — so later `.attrs()` calls
 * override earlier ones.
 *
 * Returns a curried function: first call binds the chain, second
 * call provides the arguments and executes the reduction.
 */
type OptionFunc<A> = (...arg: A[]) => Record<string, unknown>;
type CalculateChainOptions = <A>(
  options?: OptionFunc<A>[],
) => (args: A[]) => ReturnType<OptionFunc<A>>;

export const calculateChainOptions: CalculateChainOptions = (options) => (args) => {
  const result = {};
  if (!options || isEmpty(options)) return result;

  return options.reduce((acc, item) => Object.assign(acc, item(...args)), {});
};
