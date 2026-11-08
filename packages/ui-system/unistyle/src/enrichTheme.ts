import { config, isEmpty, type PyreonTheme } from '@pyreon/ui-core'
import { createMediaQueries, sortBreakpoints } from './responsive'

// Dev-time counter sink — see packages/internals/perf-harness/COUNTERS.md.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

// `PyreonTheme` is now owned by `@pyreon/ui-core` (the ui-system base) so
// ui-core and unistyle agree on it without a dependency cycle. Re-exported
// here for back-compat — `import { PyreonTheme } from '@pyreon/unistyle'` still
// works.
export type { PyreonTheme }

/**
 * Enrich a theme with pre-computed responsive utilities.
 * Adds sorted breakpoints and media-query tagged-template helpers
 * to `theme.__PYREON__` for consumption by `makeItResponsive`.
 *
 * This is a pure function — safe to call outside of component context.
 *
 * @example
 * const enriched = enrichTheme({ rootSize: 16, breakpoints: { xs: 0, sm: 576, md: 768 } })
 * enriched.__PYREON__.sortedBreakpoints // ['xs', 'sm', 'md']
 * enriched.__PYREON__.media.sm          // tagged-template for @media (min-width: 36em)
 */
// Identity memo: raw theme → its enriched theme, plus enriched → itself (so
// enriching an already-enriched theme — `<PyreonUI theme={enrichTheme(t)}>`,
// which enriches again — returns the same object). Every style cache in the
// ui-system keys on the enriched object's identity (rocketstyle `_rsMemo` and
// ThemeManager, styler class caches, unistyle `makeItResponsive`,
// `themeToCssVars`); a fresh object per `<PyreonUI>` mount made all of them
// miss once per mount — once per SSR request. Bounded by the theme objects
// themselves (WeakMap: an entry dies with its key). Records `config.css` so a
// later `init({ css })` re-derives the media helpers instead of returning
// ones built with the previous engine. Assumes a theme is not mutated in
// place, which every downstream identity cache already assumes (and a theme
// swap needs a new object to notify anyway).
const enrichedByTheme = new WeakMap<object, { css: unknown; enriched: PyreonTheme }>()

export function enrichTheme<T extends PyreonTheme>(
  theme: T,
): T & Required<Pick<PyreonTheme, '__PYREON__'>> {
  const css = config.css
  const hit = enrichedByTheme.get(theme)
  if (hit !== undefined && hit.css === css) {
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('unistyle.enrichTheme.hit')
    return hit.enriched as T & Required<Pick<PyreonTheme, '__PYREON__'>>
  }

  const { breakpoints, rootSize = 16 } = theme

  const sortedBreakpoints =
    breakpoints && !isEmpty(breakpoints) ? sortBreakpoints(breakpoints) : undefined

  const media =
    breakpoints && !isEmpty(breakpoints)
      ? createMediaQueries({ breakpoints, css, rootSize })
      : undefined

  const enriched = {
    ...theme,
    __PYREON__: { sortedBreakpoints, media },
  }
  const entry = { css, enriched }
  enrichedByTheme.set(theme, entry)
  enrichedByTheme.set(enriched, entry)
  return enriched
}
