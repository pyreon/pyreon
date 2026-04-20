import type { VNode } from '@pyreon/core'
import { provide } from '@pyreon/core'
import { ThemeContext } from '@pyreon/styler'
import { Provider as CoreProvider, context } from '@pyreon/ui-core'
import type { PyreonTheme } from './enrichTheme'
import { enrichTheme } from './enrichTheme'

export type TProvider = {
  theme: PyreonTheme
  children?: VNode | null
}

/**
 * @internal Low-level provider — use `PyreonUI` from `@pyreon/ui-core` instead.
 *
 * Unistyle Provider — wraps the core Provider and enriches the theme
 * with pre-computed sorted breakpoints and media-query tagged-template
 * helpers consumed by `makeItResponsive`.
 *
 * @deprecated Prefer `<PyreonUI theme={theme} mode="light">` which handles
 * all three context layers (styler, core, mode) in one component.
 */
function Provider(props: TProvider): VNode | null {
  const { theme, children } = props

  const enrichedTheme = enrichTheme(theme)

  // Provide enriched theme to both the ui-core context (for rocketstyle/elements)
  // AND the styler ThemeContext (for styled() components and makeItResponsive).
  // Without this, styled() components receive an empty theme and all responsive
  // styles are skipped (@media queries produce NaN values).
  // ThemeContext is a ReactiveContext — provide an accessor.
  provide(ThemeContext, () => enrichedTheme)

  return CoreProvider({ theme: enrichedTheme, children }) as VNode | null
}

export { context }

export default Provider
