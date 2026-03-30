export type UseLatest = <T>(value: T) => { readonly current: T };

/**
 * Returns a ref-like object that always holds the latest value.
 * Useful to avoid stale closures in callbacks and effects.
 *
 * In Pyreon, since the component body runs once, this simply wraps
 * the value in a mutable object. The caller is expected to call this
 * once and update `.current` manually if needed, or pass a reactive
 * getter to read the latest value.
 */
export const useLatest: UseLatest = <T>(value: T) => {
  const ref = { current: value };
  return ref;
};

export default useLatest;
