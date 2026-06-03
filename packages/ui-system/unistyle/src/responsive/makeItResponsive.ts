import { isEmpty } from '@pyreon/ui-core'
import type createMediaQueries from './createMediaQueries'
import normalizeTheme from './normalizeTheme'
import optimizeBreakpointDeltas from './optimizeBreakpointDeltas'
import optimizeTheme from './optimizeTheme'
import type sortBreakpoints from './sortBreakpoints'
import transformTheme from './transformTheme'

type Css = (strings: TemplateStringsArray, ...values: any[]) => any

/**
 * Coerce a styles-callback result to a CSS string for delta optimization.
 * Returns null when the engine's result type can't be stringified cleanly
 * (e.g. styled-components / Emotion objects whose default toString() yields
 * "[object Object]") — caller falls back to the unoptimized path.
 *
 * Styler's CSSResult provides toString() that resolves with empty props,
 * so any function interpolation that needs render-time props must come from
 * the styles-callback closure (theme is destructured at call time, not
 * resolved later). Verified across the project's styles callbacks.
 */
const stringifyResult = (result: unknown): string | null => {
  if (result == null) return ''
  if (typeof result === 'string') return result
  // CSSResult duck-type fast path: has `strings` (TemplateStringsArray) and
  // `values`. We know its toString() resolves to clean CSS, so we can skip
  // the "[object Foo]" validation for the common path.
  if (typeof result === 'object' && 'strings' in result && 'values' in result) {
    return String(result)
  }
  // Foreign engine result — coerce and validate. Default
  // Object.prototype.toString → "[object Foo]" → bail out so caller can fall
  // back to the unoptimized path.
  const text = String(result)
  return text.includes('[object ') ? null : text
}

type CustomTheme = Record<string, unknown>

type Theme = Partial<{
  rootSize: number
  breakpoints: Record<string, number>
  __PYREON__: Partial<{
    media: ReturnType<typeof createMediaQueries>
    sortedBreakpoints: ReturnType<typeof sortBreakpoints>
  }>
}> &
  CustomTheme

// Default tightened from `any` to `Partial<Record<string, unknown>>` so
// un-typed callers (`MakeItResponsiveStyles` with no generic) get strict
// `unknown` per key — forcing narrowing at the access site. Every shipped
// caller now passes an explicit theme shape:
//   - coolgrid Container/Row/Col: `Pick<StyledTypes, 'width' | 'extraStyles'>`
//   - elements Wrapper/Content/Text: `ThemeProps` (per helper)
// The constraint stays `Partial<Record<string, any>>` (not `unknown`) so
// strict generic arguments with named keys (e.g. `Partial<{ direction:
// ContentDirection; ... }>`) continue to satisfy it.
export type MakeItResponsiveStyles<
  T extends Partial<Record<string, any>> = Partial<Record<string, unknown>>,
> = ({
  theme,
  css,
  rootSize,
  globalTheme,
}: {
  theme: T
  css: Css
  rootSize?: number | undefined
  globalTheme?: Record<string, unknown> | undefined
  // The trailing `| any` collapsed the whole union to `any`. Every styles
  // callback in the system returns either a `cssFn` template result
  // (`ReturnType<typeof css>`) or an empty string for "no styles" — the
  // tightened union captures both shapes exactly.
}) => ReturnType<typeof css> | string

export type MakeItResponsive = ({
  theme,
  key,
  css,
  styles,
  normalize,
}: {
  theme?: CustomTheme
  key?: string
  css: Css
  styles: MakeItResponsiveStyles
  normalize?: boolean
  // Inner props (the `key`-indexed read) carries arbitrary entries the
  // outer styled component spreads — `unknown` is honest at this boundary
  // (callers narrow via the `key` lookup at line 112). The function body
  // returns `''`, a `css`-tagged result, a memoized `unknown[]` (cached
  // per-breakpoint render array), or a fresh `unknown[]` from the
  // `bps.map(...)` path.
}) => (props: { theme?: Theme; [prop: string]: unknown }) => ReturnType<Css> | string | unknown[]

/**
 * Per-internal-theme cache:
 *  - `optimized`: the per-breakpoint theme object (`{ xs: {...}, md: {...} }`)
 *    after `normalize → transform → optimize`. Reused as long as the same
 *    `sortedBreakpoints` reference is passed in.
 *  - `rendered`: memoized FINAL output (array of media-wrapped CSSResults),
 *    keyed by the outer `theme` reference. Hit when the same internal theme
 *    AND the same outer theme render again — which is the common case when
 *    the provider value is stable. Avoids re-running renderStyles +
 *    optimizeBreakpointDeltas on every parent re-render.
 */
interface ThemeCacheEntry {
  breakpoints: unknown
  optimized: Record<string, Record<string, unknown>>
  rendered?: WeakMap<object, unknown[]> | undefined
}

const themeCache = new WeakMap<object, ThemeCacheEntry>()

/**
 * Core responsive engine used by every styled component in the system.
 *
 * Returns a styled-components interpolation function that:
 * 1. Reads the component's theme prop (via `key` or direct `theme`)
 * 2. Without breakpoints → renders plain CSS
 * 3. With breakpoints → normalizes, transforms (property-per-breakpoint →
 *    breakpoint-per-property), optimizes (deduplicates identical breakpoints),
 *    deltas the per-breakpoint output against the mobile-first cascade
 *    (drops re-emitted unchanged declarations), and wraps each non-empty
 *    breakpoint's deltas in the appropriate `@media` query. Falls back to
 *    the unoptimized path if any breakpoint's render result can't be
 *    cleanly stringified.
 */
const makeItResponsive: MakeItResponsive =
  ({ theme: customTheme, key = '', css, styles, normalize = true }) =>
  ({ theme = {}, ...props }) => {
    // `props[key]` carries a styled-component-injected theme prop whose
    // shape is determined by the styles callback's generic — opaque from
    // here. The outer `MakeItResponsive` props index signature is
    // `[prop: string]: unknown` (tightened from `any`); cast to the shape
    // the downstream pipeline expects so the rest of the body retains
    // strict typing without per-call casts.
    const internalTheme = (customTheme || props[key]) as Record<string, unknown>

    // if no theme is defined, return empty object
    if (isEmpty(internalTheme)) return ''

    const { rootSize, breakpoints, __PYREON__, ...restTheme } = theme as Theme

    const renderStyles = (styleTheme: Record<string, unknown>): ReturnType<typeof styles> =>
      styles({ theme: styleTheme, css, rootSize, globalTheme: restTheme })

    // if there are no breakpoints, return just standard css
    if (isEmpty(breakpoints) || isEmpty(__PYREON__)) {
      return css`
        ${renderStyles(internalTheme)}
      `
    }

    // isEmpty guard above ensures __PYREON__ is defined here
    const { media, sortedBreakpoints } = __PYREON__ as NonNullable<typeof __PYREON__>

    let optimizedTheme: Record<string, Record<string, unknown>>
    const entry = themeCache.get(internalTheme)
    const breakpointsMatch = entry?.breakpoints === sortedBreakpoints

    // Full-render cache: same internal theme + same outer theme → return
    // the previous render's output verbatim. CSSResult instances are
    // immutable so reusing them is safe.
    if (entry && breakpointsMatch && entry.rendered) {
      const memoized = entry.rendered.get(theme as object)
      if (memoized) return memoized
    }

    if (entry && breakpointsMatch) {
      optimizedTheme = entry.optimized
    } else {
      let helperTheme = internalTheme

      /* v8 ignore start — defensive `sortedBreakpoints ?? []` fallbacks; breakpoints always set in real usage */
      if (normalize) {
        helperTheme = normalizeTheme({
          theme: internalTheme,
          breakpoints: sortedBreakpoints ?? [],
        })
      }

      const transformedTheme = transformTheme({
        theme: helperTheme,
        breakpoints: sortedBreakpoints ?? [],
      })

      optimizedTheme = optimizeTheme({
        theme: transformedTheme,
        breakpoints: sortedBreakpoints ?? [],
      })
      /* v8 ignore stop */

      themeCache.set(internalTheme, {
        breakpoints: sortedBreakpoints,
        optimized: optimizedTheme,
        // Preserve any pre-existing rendered cache when re-entering with a
        // changed sortedBreakpoints reference — usually unreachable because
        // breakpoints come from a stable provider value, but the explicit
        // handling avoids a memory cliff in tests / HMR.
        rendered: entry?.rendered,
      })
    }

    /* v8 ignore next — defensive `sortedBreakpoints ?? []` fallback */
    const bps = sortedBreakpoints ?? []

    // Resolve each per-breakpoint render to a string so the delta optimizer
    // can diff at the property level. If any breakpoint's result can't be
    // cleanly stringified (foreign engine result), fall back to the original
    // unoptimized path that lets the engine resolve interpolations itself.
    const renderedTexts: (string | null)[] = bps.map((item: string) => {
      const breakpointTheme = optimizedTheme[item]
      /* v8 ignore next — defensive null-theme/media guard */
      if (!breakpointTheme || !media) return ''
      return stringifyResult(renderStyles(breakpointTheme))
    })

    const canOptimize = renderedTexts.every((t) => t !== null)
    let result: unknown[]
    if (canOptimize) {
      const deltas = optimizeBreakpointDeltas(renderedTexts as string[])
      result = bps.map((item: string, i: number) => {
        const cssText = deltas[i]
        /* v8 ignore next — defensive null-cssText/media guard */
        if (!cssText || !media) return ''
        return (media as Record<string, any>)[item]`${cssText}`
      })
    } else {
      result = bps.map((item: string) => {
        const breakpointTheme = optimizedTheme[item]
        /* v8 ignore next — defensive null-theme/media guard */
        if (!breakpointTheme || !media) return ''
        const r = renderStyles(breakpointTheme)
        return (media as Record<string, any>)[item]`
          ${r};
        `
      })
    }

    // Memoize the final rendered output by outer theme reference. Stable
    // theme + stable internal theme → future renders return immediately.
    // Invariant: by this point themeCache always has an entry for
    // internalTheme — earlier paths either hit the rendered-cache and
    // returned, or wrote one via themeCache.set above.
    const cacheEntry = themeCache.get(internalTheme)
    if (cacheEntry) {
      if (!cacheEntry.rendered) cacheEntry.rendered = new WeakMap()
      cacheEntry.rendered.set(theme as object, result)
    }

    return result
  }

export default makeItResponsive
