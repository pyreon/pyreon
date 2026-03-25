import type { VNode } from "@pyreon/core"
import { provide } from "@pyreon/core"
import { ThemeContext } from "@pyreon/styler"
import { Provider as CoreProvider, config, context, isEmpty } from "@pyreon/ui-core"
import { createMediaQueries, sortBreakpoints } from "./responsive"

type Theme = {
  rootSize: number
  breakpoints?: Record<string, number>
  __PYREON__?: never
} & Partial<Record<string, unknown>>

export type TProvider = {
  theme: Theme
  children?: VNode | null
}

/**
 * Unistyle Provider — wraps the core Provider and enriches the theme
 * with pre-computed sorted breakpoints and media-query tagged-template
 * helpers consumed by `makeItResponsive`.
 */
function Provider(props: TProvider): VNode | null {
  const { theme, children } = props
  const { breakpoints, rootSize } = theme

  const sortedBreakpoints =
    breakpoints && !isEmpty(breakpoints) ? sortBreakpoints(breakpoints) : undefined

  const media =
    breakpoints && !isEmpty(breakpoints)
      ? createMediaQueries({
          breakpoints,
          css: config.css,
          rootSize,
        })
      : undefined

  const enrichedTheme = {
    ...theme,
    __PYREON__: {
      sortedBreakpoints,
      media,
    },
  }

  // Provide enriched theme to both the ui-core context (for rocketstyle/elements)
  // AND the styler ThemeContext (for styled() components and makeItResponsive).
  // Without this, styled() components receive an empty theme and all responsive
  // styles are skipped (@media queries produce NaN values).
  provide(ThemeContext, enrichedTheme)

  return CoreProvider({ theme: enrichedTheme, children }) as VNode | null
}

export { context }

export default Provider
