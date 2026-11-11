import { isEmpty } from '@pyreon/ui-core'
import type { MakeItResponsive } from '@pyreon/unistyle'
import { enrichTheme, makeItResponsive } from '@pyreon/unistyle'
import { defaultBreakpoints, defaultContainerWidths } from './theme'

/**
 * coolgrid's own defaults, applied whenever the theme in context carries no
 * grid configuration — e.g. `<PyreonUI theme={appTheme}>` where the app theme
 * has no `breakpoints` / `grid` keys. Without them a responsive `size` array
 * never got split per breakpoint (the whole array reached `isVisible`, which
 * hid the column off-screen) and a scalar `size` had no `columns` to divide by.
 * The values match coolgrid's exported `theme`.
 */
export const DEFAULT_COLUMNS = 12

type ThemeLike = Record<string, unknown> | undefined | null

/** True when the theme defines no breakpoints, so coolgrid's defaults apply. */
export const lacksBreakpoints = (theme: ThemeLike): boolean =>
  isEmpty(theme?.breakpoints as Record<string, unknown> | undefined)

/**
 * Default container max-widths. They are keyed by coolgrid's default
 * breakpoint names, so they only apply when the theme has no breakpoints of
 * its own (a custom `{ phone, tablet }` scale would not match the keys).
 */
export const defaultContainerWidthsFor = (
  theme: ThemeLike,
): Record<string, string | number> | undefined =>
  lacksBreakpoints(theme) ? defaultContainerWidths : undefined

// Theme → the same theme with coolgrid's default breakpoints, enriched.
// Keyed weakly on the theme object, so an entry dies with its theme (the
// same lifetime every downstream identity cache already assumes). The
// value is the RAW merged theme; `enrichTheme` memoizes on it and re-derives
// when the styling engine changes.
const withBreakpoints = new WeakMap<object, Record<string, unknown>>()
const EMPTY_THEME: Record<string, unknown> = {}

const needsDefaults = (theme: ThemeLike): boolean => {
  if (lacksBreakpoints(theme)) return true
  const internal = theme?.__PYREON__ as { sortedBreakpoints?: unknown } | undefined
  return !internal?.sortedBreakpoints
}

/**
 * Returns the theme unchanged when it already carries enriched breakpoints;
 * otherwise a stable, enriched copy that adds coolgrid's default breakpoints
 * (and keeps the theme's own breakpoints when it has some but was never
 * enriched).
 */
export const withDefaultBreakpoints = (theme: ThemeLike): Record<string, unknown> => {
  const source = theme ?? EMPTY_THEME
  let raw = withBreakpoints.get(source)
  if (raw === undefined) {
    raw = lacksBreakpoints(source) ? { ...source, breakpoints: defaultBreakpoints } : source
    withBreakpoints.set(source, raw)
  }
  return enrichTheme(raw)
}

/**
 * `makeItResponsive` for the grid components: when the styled theme has no
 * breakpoints, render against coolgrid's default breakpoints instead of
 * collapsing every responsive value into one breakpoint-less rule.
 */
export const makeGridResponsive: MakeItResponsive = (options) => {
  const responsive = makeItResponsive(options)
  return (props) =>
    needsDefaults(props.theme)
      ? responsive({ ...props, theme: withDefaultBreakpoints(props.theme) })
      : responsive(props)
}
