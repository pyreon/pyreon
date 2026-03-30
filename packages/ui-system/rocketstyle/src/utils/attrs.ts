import type { MultiKeys } from "../types/dimensions";

// --------------------------------------------------------
// remove undefined props
// --------------------------------------------------------
/** Strips keys with `undefined` values so they don't shadow default props during merging. */
type RemoveUndefinedProps = <T extends Record<string, any>>(props: T) => Partial<T>;

export const removeUndefinedProps: RemoveUndefinedProps = (props) => {
  const result: Partial<typeof props> = {};
  for (const key in props) {
    if (props[key] !== undefined) result[key] = props[key];
  }
  return result;
};

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
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(props)) {
    if (keywords[key] && props[key]) result[key] = props[key];
  }
  return result as { [I in keyof K & keyof T]: T[I] };
};

// --------------------------------------------------------
// combine values
// --------------------------------------------------------
/**
 * Returns a curried function that evaluates an array of `.attrs()` callbacks,
 * spreading each result into a single merged props object via `Object.assign`.
 */
type OptionFunc<A> = (...arg: A[]) => Record<string, unknown>;
type CalculateChainOptions = <A>(
  options?: OptionFunc<A>[],
) => (args: A[]) => ReturnType<OptionFunc<A>>;

export const calculateChainOptions: CalculateChainOptions = (options) => (args) => {
  if (!options || options.length === 0) return {};

  return options.reduce<Record<string, unknown>>(
    (acc, item) => Object.assign(acc, item(...args)),
    {},
  );
};

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
  useBooleans?: boolean;
  multiKeys?: MultiKeys;
}) => ({
  props,
  dimensions,
}: {
  props: Record<string, unknown>;
  dimensions: Record<string, unknown>;
}) => Record<string, any>;
export const calculateStylingAttrs: CalculateStylingAttrs =
  ({ useBooleans, multiKeys }) =>
  ({ props, dimensions }) => {
    const result: Record<string, any> = {};

    // (1) find dimension keys values & initialize
    // object with possible options
    Object.keys(dimensions).forEach((item) => {
      const pickedProp = props[item];
      const t = typeof pickedProp;

      // if the property is multi key, allow assign array as well
      if (multiKeys?.[item] && Array.isArray(pickedProp)) {
        result[item] = pickedProp;
      }
      // assign when it's only a string or number otherwise it's considered
      // as invalid param
      else if (t === "string" || t === "number") {
        result[item] = pickedProp;
      } else {
        result[item] = undefined;
      }
    });

    // (2) if booleans are being used let's find the rest
    if (useBooleans) {
      const propsKeys = Object.keys(props);

      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex logic is inherent to this function
      Object.entries(result).forEach(([key, value]) => {
        const isMultiKey = multiKeys?.[key];

        // when value in result is not assigned yet
        if (!value) {
          let newDimensionValue: string | string[] | undefined;
          const keywordSet = new Set(Object.keys(dimensions[key] as Record<string, unknown>));

          if (isMultiKey) {
            newDimensionValue = propsKeys.filter((propKey) => keywordSet.has(propKey));
          } else {
            // iterate backwards to guarantee the last one will have
            // a priority over previous ones
            for (let i = propsKeys.length - 1; i >= 0; i--) {
              const k = propsKeys[i] as string;
              if (keywordSet.has(k) && props[k]) {
                newDimensionValue = k;
                break;
              }
            }
          }

          result[key] = newDimensionValue;
        }
      });
    }

    return result;
  };
