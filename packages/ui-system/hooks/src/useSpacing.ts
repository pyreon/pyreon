import useRootSize from "./useRootSize"

export type UseSpacing = (base?: number | undefined) => (multiplier: number) => string

/**
 * Returns a `spacing(n)` function that computes spacing values
 * based on `rootSize` from the theme.
 *
 * @param base - Base spacing unit in px (defaults to `rootSize / 2`, i.e. 8px)
 *
 * @example
 * ```ts
 * const spacing = useSpacing()
 * spacing(1)  // "8px"
 * spacing(2)  // "16px"
 * spacing(0.5) // "4px"
 * ```
 */
export const useSpacing: UseSpacing = (base) => {
  const { rootSize } = useRootSize()
  const unit = base ?? rootSize / 2

  return (multiplier: number) => `${unit * multiplier}px`
}

export default useSpacing
