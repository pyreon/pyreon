import { useTheme } from '@pyreon/styler'

type RootSizeResult = {
  rootSize: number
  pxToRem: (px: number) => string
  remToPx: (rem: number) => number
}

export type UseRootSize = () => RootSizeResult

/**
 * Returns `rootSize` from the theme context along with
 * `pxToRem` and `remToPx` conversion utilities.
 *
 * Defaults to `16` when no rootSize is set in the theme.
 *
 * Lives in `@pyreon/ui-core` (the base of the ui-system layer) so the
 * ui-system owns its theme-reader hooks without reaching into the
 * `@pyreon/hooks` fundamentals package.
 */
export const useRootSize: UseRootSize = () => {
  const theme = useTheme<{ rootSize?: number | undefined }>()
  const rootSize = theme?.rootSize ?? 16

  return {
    rootSize,
    pxToRem: (px: number) => `${px / rootSize}rem`,
    remToPx: (rem: number) => rem * rootSize,
  }
}

export default useRootSize
