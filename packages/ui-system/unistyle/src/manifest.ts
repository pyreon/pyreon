import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/unistyle',
  title: 'Responsive CSS Utilities',
  tagline:
    'Responsive breakpoints, CSS property mappings, unit utilities, theme enrichment',
  description:
    'Foundational responsive-style layer that powers every visual package above it (`elements`, `rocketstyle`, `coolgrid`, `kinetic`). `enrichTheme()` merges a partial user theme with the default breakpoints / spacing / unit utilities so the rest of the system has a complete theme to read. `makeItResponsive()` turns a value or per-breakpoint map into the right CSS for the current screen. `createMediaQueries()` builds breakpoint-keyed media queries; `styles()` generates CSS from a theme; `alignContent()` resolves alignment shorthand to flex / grid CSS. The package is the single source of truth for responsive prop semantics across the UI system.',
  category: 'browser',
  features: [
    'enrichTheme(theme) — merge a partial theme with default breakpoints / spacing / units',
    'breakpoints() — default responsive breakpoint set',
    'createMediaQueries(breakpoints) — build breakpoint-keyed media query strings',
    'makeItResponsive() — resolve a value / array / breakpoint object to CSS for the current screen',
    'styles(theme) — generate CSS from a theme',
    'alignContent() — resolve alignX / alignY / direction to flex CSS',
    'extendCss() — extend a CSS definition with overrides',
    'stripUnit / value / values — unit-utility helpers',
    'themeToCssVars(theme) — autogenerate CSS custom properties from a theme JSON; units baked at emission (px→rem via rootSize)',
    'resolveCssVarReferences(value, registry) — inline var() references back to raw values for non-CSS consumers (document export, devtools)',
    'Provider / context — React-style provider for the theme (used internally by PyreonUI)',
  ],
  longExample: `import { enrichTheme, makeItResponsive, alignContent } from '@pyreon/unistyle'
import type { MakeItResponsiveStyles } from '@pyreon/unistyle'
import { config } from '@pyreon/ui-core'

const { css } = config

// 1. Enrich a partial user theme with defaults — required before passing to
//    PyreonUI. enrichTheme also precomputes the breakpoint media-query helpers
//    into theme.__PYREON__ for makeItResponsive to consume.
const theme = enrichTheme({
  colors: { primary: '#3b82f6', secondary: '#6366f1' },
  fonts: { body: 'Inter, sans-serif' },
})

// 2. makeItResponsive builds a styled-component interpolation from a \`styles\`
//    callback. It reads the component's theme prop and emits the mobile-first
//    @media cascade — drop the result into a styled template literal.
const boxStyles: MakeItResponsiveStyles<{ padding?: string }> = ({ theme: t, css: cssFn }) =>
  cssFn\`padding: \${t.padding};\`
const responsivePadding = makeItResponsive({ key: '$box', css, styles: boxStyles, normalize: true })

// 3. alignContent maps direction / alignX / alignY shorthand to flex CSS
const flexCss = alignContent({ direction: 'rows', alignX: 'center', alignY: 'top' })
// → 'flex-direction: column; align-items: center; justify-content: flex-start;'

// 4. Autogenerate CSS custom properties from a theme JSON (units baked at emission)
import { themeToCssVars } from '@pyreon/unistyle'
const { vars } = themeToCssVars({ rootSize: 16, spacing: { small: 8 }, ratio: { medium: 1.5 } })
vars.spacing.small // 'var(--px-spacing-small)'  (emitted as 0.5rem in the :root block)
const width = \`calc(\${vars.spacing.small} * \${vars.ratio.medium})\` // proportional sizing, native CSS`,
  api: [
    {
      name: 'enrichTheme',
      kind: 'function',
      signature: 'enrichTheme(theme: PartialTheme): Theme',
      summary:
        'Merge a partial theme with the full default theme (breakpoints, spacing, unit utilities, fallback colors). Always call this before passing a user theme to `PyreonUI` — raw theme objects miss the default breakpoints and spacing scale that the rest of the UI system reads from. Idempotent: enriching an already-enriched theme is a no-op.',
      example: `import { enrichTheme } from "@pyreon/unistyle"

const theme = enrichTheme({
  colors: { primary: "#3b82f6", secondary: "#6366f1" },
  fonts: { body: "Inter, sans-serif" },
})

// Merges user overrides with default breakpoints, spacing, and units`,
      mistakes: [
        'Passing the raw partial theme to `<PyreonUI theme={...}>` without enriching — `theme.breakpoints` is undefined and every responsive prop falls back to the desktop value',
        'Mutating the theme after passing it to `PyreonUI` — the styler resolver caches off the theme identity; clone + re-enrich for whole-theme swaps',
      ],
      seeAlso: ['breakpoints', 'createMediaQueries'],
    },
    {
      name: 'breakpoints',
      kind: 'constant',
      signature: 'const breakpoints: { rootSize: number; breakpoints: Record<string, number> }',
      summary:
        'The default breakpoint configuration — a constant `{ rootSize, breakpoints }` object, NOT a function. `breakpoints.breakpoints` is the min-width map keyed by name (`xs` 0, `sm` 576, `md` 768, `lg` 992, `xl` 1200, `xxl` 1440) and `breakpoints.rootSize` is 16. The same values are folded into `enrichTheme()` output, so most consumers read the enriched theme rather than this constant. Use it when you need the defaults outside a theme context (e.g. building a custom theme or seeding `createMediaQueries`).',
      example: `import { breakpoints } from '@pyreon/unistyle'

breakpoints.breakpoints // { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1440 }
breakpoints.rootSize    // 16`,
      seeAlso: ['enrichTheme', 'createMediaQueries'],
    },
    {
      name: 'createMediaQueries',
      kind: 'function',
      signature:
        'createMediaQueries(options: { breakpoints: Record<string, number>; rootSize: number; css: CssFn }): Record<string, (strings: TemplateStringsArray, ...values: unknown[]) => string>',
      summary:
        'Build a record of media-query tagged-templates keyed by breakpoint name from a `{ breakpoints, rootSize, css }` options bag (NOT a bare breakpoints argument). Each value is a FUNCTION — a `css` tagged-template that wraps the interpolated CSS in that breakpoint `@media (min-width)` block (the `0` breakpoint passes through unwrapped). Widths convert to `em` via `rootSize`. Used internally by `enrichTheme()` (stored on `theme.__PYREON__.media`); call directly when composing custom CSS-in-JS rules outside the responsive-prop pipeline.',
      example: `import { createMediaQueries, breakpoints } from '@pyreon/unistyle'
import { config } from '@pyreon/ui-core'

const queries = createMediaQueries({
  breakpoints: breakpoints.breakpoints,
  rootSize: breakpoints.rootSize,
  css: config.css,
})
// each value is a tagged-template that wraps CSS in that breakpoint @media block:
// queries.sm\`color: red\` → '@media only screen and (min-width: 36em) { color: red }'`,
      seeAlso: ['breakpoints', 'makeItResponsive'],
    },
    {
      name: 'makeItResponsive',
      kind: 'function',
      signature:
        'makeItResponsive(options: { css: CssFn; styles: MakeItResponsiveStyles; theme?: object; key?: string; normalize?: boolean }): (props) => CSSResult | string',
      summary:
        'Build a styled-component interpolation from a `styles` callback. This is NOT a value resolver — it returns a FUNCTION that, given component props, reads the theme (via `key` or `props.theme`) and emits the mobile-first `@media` cascade. The `styles` callback (a `MakeItResponsiveStyles`) receives the resolved per-breakpoint `{ theme, css, rootSize }` and returns the CSS for that breakpoint; when the theme carries responsive per-breakpoint values, makeItResponsive normalizes then transforms then optimizes them into `@media (min-width)` blocks (mobile-first, only deltas emitted). `key` scopes which prop bag holds the theme; `normalize` toggles the breakpoint normalization; pass the `css` tag from `@pyreon/ui-core` `config`. Drop the returned interpolation into a styled template literal.',
      example: `import { makeItResponsive } from '@pyreon/unistyle'
import type { MakeItResponsiveStyles } from '@pyreon/unistyle'
import { config } from '@pyreon/ui-core'

const { css } = config

// The \`styles\` callback receives the resolved per-breakpoint theme (typed via
// the generic). makeItResponsive returns a styled-component interpolation.
const styles: MakeItResponsiveStyles<{ padding?: string }> = ({ theme: t, css: cssFn }) =>
  cssFn\`padding: \${t.padding};\`

const responsive = makeItResponsive({ key: '$box', css, styles, normalize: true })
// styled('div')\`\${responsive}\` — reads the component theme prop, emits @media queries`,
      mistakes: [
        'Passing `{ value, property }` — makeItResponsive is a styled-component interpolation factory, not a value resolver; provide a `styles` callback plus the `css` tag from `@pyreon/ui-core` config',
        'Passing CSS-spec property names (`borderTopWidth`) inside the styles callback — unistyle uses property-first naming (`borderWidthTop`); the responsive transformer expects the unistyle convention',
        'Forgetting to pass an enriched theme — without `theme.__PYREON__` (populated by `enrichTheme`), per-breakpoint values fall back to the base value at every breakpoint',
        'Expecting a `null` slot in a mobile-first array to fill from the LAST element — a `null`/`undefined` slot is a SKIP that inherits the PREVIOUS breakpoint (`["red", null, "blue"]` = xs red, sm inherits red, md blue), identical to a breakpoint object with a missing key',
      ],
      seeAlso: ['createMediaQueries', 'styles'],
    },
    {
      name: 'styles',
      kind: 'function',
      signature:
        'styles(options: { theme: InnerTheme; css: CssFn; rootSize?: number; globalTheme?: object }): CSSResult',
      summary:
        'Generate the CSS for a flat theme object — box-model, typography, spacing, border, and layout declarations resolved from a `{ theme, css }` options bag (NOT a bare theme argument). Returns the `css`-tagged result. Used to produce the declarations that back every styled component. Most consumers do not call this directly; the `PyreonUI` provider invokes it internally on theme mount.',
      example: `import { styles } from '@pyreon/unistyle'
import { config } from '@pyreon/ui-core'

const { css } = config
const rules = styles({ theme: { padding: '8px', color: '#222' }, css })
// → the resolved CSS declarations for the given theme`,
      seeAlso: ['enrichTheme', 'extendCss'],
    },
    {
      name: 'alignContent',
      kind: 'function',
      signature:
        'alignContent(options: { alignX?: AlignContentAlignXKeys; alignY?: AlignContentAlignYKeys; direction?: AlignContentDirectionKeys }): string | null',
      summary:
        'Resolve `direction` / `alignX` / `alignY` shorthand to the matching flex CSS (`flex-direction`, `align-items`, `justify-content`). The Element / Row / Column primitives use this internally — it is exposed for custom layout components that want the same alignment semantics. `direction` is one of `inline` / `reverseInline` / `rows` / `reverseRows` (`inline` maps to `row`, `rows` to `column`; the `inline` variants swap which axis alignX / alignY drive). Returns `null` when any of the three inputs is missing.',
      example: `import { alignContent } from '@pyreon/unistyle'

alignContent({ direction: 'rows', alignX: 'center', alignY: 'top' })
// → 'flex-direction: column; align-items: center; justify-content: flex-start;'

alignContent({ direction: 'inline', alignX: 'spaceBetween', alignY: 'center' })
// → 'flex-direction: row; align-items: center; justify-content: space-between;'`,
      seeAlso: ['makeItResponsive'],
    },
    {
      name: 'extendCss',
      kind: 'function',
      signature: 'extendCss(styles: ((css: CssFn) => string) | string | null | undefined): string',
      summary:
        'Flatten a CSS definition to a string. Takes a SINGLE argument that is either a css-callback (invoked with a simple `css` tag, its result returned), a raw CSS string (returned as-is), or `null` / `undefined` (returns an empty string). Used by rocketstyle dimension chains + the elements / coolgrid styled helpers to inline a component `extraStyles` / `extendCss` prop. NOT an object deep-merge — it takes ONE argument and never layers a base with an override.',
      example: `import { extendCss } from '@pyreon/unistyle'

extendCss('color: red;')                    // → 'color: red;'  (string returned as-is)
extendCss((css) => css\`color: \${'red'};\`)   // → 'color: red;'  (callback invoked)
extendCss(undefined)                         // → ''             (nullish → empty string)`,
      seeAlso: ['styles'],
    },
    {
      name: 'stripUnit',
      kind: 'function',
      signature:
        'stripUnit(value: string | number, unitReturn?: boolean): number | string | [number | string, string | undefined]',
      summary:
        'Strip the unit suffix from a CSS value and return the numeric part (`"16px"` → `16`, `"1.5rem"` → `1.5`). A number passes through unchanged, and a string that is NOT a `<number><unit>` shape (e.g. `"calc(…)"`, `"auto"`) is returned verbatim. Pass `unitReturn: true` to get the `[value, unit]` tuple instead (`"24px"` → `[24, "px"]`; an unmatched string → `[value, undefined]`). Useful for arithmetic on theme values declared as strings without hand-parsing.',
      example: `import { stripUnit } from '@pyreon/unistyle'

stripUnit('16px')       // → 16
stripUnit('1.5rem')     // → 1.5
stripUnit(16)           // → 16
stripUnit('24px', true) // → [24, 'px']
stripUnit('auto', true) // → ['auto', undefined]`,
      seeAlso: ['value', 'values'],
    },
    {
      name: 'value',
      kind: 'function',
      signature:
        "value(input: string | number | null | undefined, rootSize?: number, outputUnit?: 'rem' | 'px' | '%' | 'em' | 'vh' | 'vw' | string): string | number | null",
      summary:
        'Convert ONE numeric/string CSS value to its final unit string. A unitless number is divided by `rootSize` (default 16) and emitted in `outputUnit` (default `rem`): `value(16)` → `"1rem"`, `value(24)` → `"1.5rem"`, `value(8)` → `"0.5rem"`. `0` always stays unitless (`0`). A `px` string is converted to rem (`value("16px")` → `"1rem"`); any other-unit string (`"2em"`, `"50%"`) and any non-numeric string (`"calc(100% - 8px)"`, `"var(--x)"`, `"auto"`) pass through verbatim — this passthrough is what lets `themeToCssVars` var leaves flow untouched. `null`/`undefined`/`""` return `null`. Pass `outputUnit: "px"` to keep a unitless number in pixels (`value(16, 16, "px")` → `"16px"`). The companion `values()` picks the first non-nullish item then applies the same conversion. NOTE: the second parameter is `rootSize` (the px→rem divisor), NOT a fallback.',
      example: `import { value } from '@pyreon/unistyle'

value(16)            // → '1rem'   (16 / rootSize 16)
value(24)            // → '1.5rem'
value(0)             // → 0        (always unitless)
value('16px')        // → '1rem'   (px → rem)
value('2em')         // → '2em'    (other units pass through)
value('calc(100% - 8px)') // → 'calc(100% - 8px)'  (verbatim passthrough)
value(16, 16, 'px')  // → '16px'   (outputUnit override)`,
      seeAlso: ['stripUnit', 'values'],
    },
    {
      name: 'themeToCssVars',
      kind: 'function',
      signature:
        'themeToCssVars(theme: object, options?: { prefix?: string; exclude?: readonly string[]; units?: Record<string, CssVarsUnitPolicy>; rootSize?: number }): { vars, css, registry }',
      summary:
        'Autogenerate CSS custom properties from a plain theme JSON. Returns `vars` (same-shape tree with every eligible leaf replaced by a `var(--px-…)` reference string — plain strings, so they flow through the entire unistyle value pipeline untouched), `css` (a ready-to-inject `:root { … }` block), and `registry` (`varName → emitted value` for consumers that cannot evaluate `var()`, e.g. document export). Units are baked at EMISSION using the same `value()` conversion the pipeline applies today: `spacing.small: 8` emits `--px-spacing-small: 0.5rem`, so themes stay authored in pixels. Conventional length keys (`spacing`/`fontSize`/`headingSize`/`elementSize`/`borderRadius` → rem, `borderWidth` → px) convert by default; everything else emits verbatim so unitless scales (`lineHeight`, `ratio`, `zIndex`) keep working in `calc()` multiplication. Pure + WeakMap-cached per theme identity — repeated calls return the SAME result object.',
      example: `import { themeToCssVars } from '@pyreon/unistyle'

const theme = { rootSize: 16, spacing: { small: 8 }, ratio: { medium: 1.5 } }
const { vars, css, registry } = themeToCssVars(theme)

vars.spacing.small               // 'var(--px-spacing-small)'
css                              // ':root {\\n  --px-spacing-small: 0.5rem;\\n  --px-ratio-medium: 1.5;\\n}'
registry.get('--px-spacing-small') // '0.5rem'

// proportional sizing is native CSS — no extra machinery:
const width = \`calc(\${vars.spacing.small} * \${vars.ratio.medium})\`
// custom scales opt into conversion per top-level key:
themeToCssVars(theme, { units: { mySizes: 'rem' } })`,
      mistakes: [
        'Doing JS arithmetic on a var leaf (`vars.spacing.small * 2` → NaN) — compose with native CSS calc instead: `` `calc(${vars.spacing.small} * 2)` ``',
        'Expecting `breakpoints` / `rootSize` to be tokenized — they are excluded by design (`@media` queries cannot read `var()`); JS consumes them at build/render time',
        'Using a var leaf for `backgroundImage` — CSS forbids `var()` inside `url(…)`; keep image URLs as raw values',
        'Forgetting to inject `css` — the function is pure; nothing lands on the page until the `:root` block reaches a style sink (`<style>` tag, `sheet.injectRules`, `createGlobalStyle`)',
        'Re-creating the theme object per render — results are WeakMap-cached by theme IDENTITY; a fresh object every call re-walks the tree and defeats downstream identity-keyed caches',
        'Assuming a custom top-level key converts to rem — only the conventional length keys convert by default; declare `units: { myScale: "rem" }` for custom scales',
      ],
      seeAlso: ['enrichTheme', 'value'],
    },
    {
      name: 'resolveCssVarReferences',
      kind: 'function',
      signature:
        'resolveCssVarReferences<T>(input: T, registry: ReadonlyMap<string, string>): T',
      summary:
        'Resolve `var(--…)` references in a string back to their raw emitted values using a `themeToCssVars` registry — for consumers that cannot evaluate CSS custom properties (document export to PDF/DOCX/email, devtools, non-CSS render targets). Inline fallbacks (`var(--x, 1rem)`) apply when the name is unknown; unresolvable references stay verbatim; non-strings pass through untouched. `calc()` expressions are inlined, NOT evaluated.',
      example: `import { resolveCssVarReferences, themeToCssVars } from '@pyreon/unistyle'

const { registry } = themeToCssVars(theme)
resolveCssVarReferences('var(--px-spacing-small)', registry)           // '0.5rem'
resolveCssVarReferences('calc(var(--px-spacing-small) * 2)', registry) // 'calc(0.5rem * 2)'
resolveCssVarReferences('var(--px-missing, 1rem)', registry)           // '1rem'`,
      mistakes: [
        'Expecting calc() to be EVALUATED — only the var() references inside are inlined; a non-CSS target needing one number must evaluate the calc itself or avoid calc-composed values',
        'Passing a registry from a DIFFERENT theme identity — registries are per themeToCssVars(theme) result; mixed registries resolve to wrong values',
      ],
      seeAlso: ['themeToCssVars'],
    },
  ],
  gotchas: [
    {
      label: 'Single source for responsive semantics',
      note:
        'Every visual package (`elements`, `rocketstyle`, `coolgrid`, `kinetic`) reads breakpoints / spacing / unit conventions from this package. Override defaults via `enrichTheme()` once at the app root rather than per-component.',
    },
    {
      label: 'CSS property naming',
      note:
        'Unistyle uses property-first naming (`borderWidthTop`, `borderColorLeft`) rather than CSS-spec order (`borderTopWidth`, `borderLeftColor`). Stick to the unistyle convention when authoring components — the responsive transformer expects it.',
    },
  ],
})
