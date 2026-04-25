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
    'Provider / context — React-style provider for the theme (used internally by PyreonUI)',
  ],
  longExample: `import { enrichTheme, makeItResponsive, createMediaQueries, alignContent } from '@pyreon/unistyle'

// 1. Enrich a partial user theme with defaults — required before passing to PyreonUI
const theme = enrichTheme({
  colors: { primary: '#3b82f6', secondary: '#6366f1' },
  fonts: { body: 'Inter, sans-serif' },
})

// 2. Build media queries keyed by breakpoint name
const queries = createMediaQueries(theme.breakpoints)
// → { xs: '@media (min-width: 0)', sm: '@media (min-width: 640px)', md: '...', ... }

// 3. Responsive props — single value, mobile-first array, or breakpoint object
const padding = makeItResponsive({ value: [8, 12, 16], property: 'padding', theme })
// → 'padding: 8px; @media (...) { padding: 12px } @media (...) { padding: 16px }'

const padding2 = makeItResponsive({
  value: { xs: 8, md: 16, xl: 24 },
  property: 'padding',
  theme,
})

// 4. alignContent maps shorthand to flex CSS
const flexCss = alignContent({ alignX: 'center', alignY: 'start', direction: 'row' })
// → 'justify-content: center; align-items: flex-start;'`,
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
      kind: 'function',
      signature: 'breakpoints(): Breakpoints',
      summary:
        'Return the default breakpoint set keyed by name (`xs`, `sm`, `md`, `lg`, `xl`, `xxl`) with min-width values in pixels. The same map is folded into `enrichTheme()` output, so most consumers read `theme.breakpoints` rather than calling this directly. Use it when you need the defaults outside a theme context (e.g. building a custom theme programmatically).',
      example: `import { breakpoints } from '@pyreon/unistyle'

const bp = breakpoints()
// { xs: 0, sm: 640, md: 768, lg: 1024, xl: 1280, xxl: 1536 }`,
      seeAlso: ['enrichTheme', 'createMediaQueries'],
    },
    {
      name: 'createMediaQueries',
      kind: 'function',
      signature: 'createMediaQueries(breakpoints: Breakpoints): Record<string, string>',
      summary:
        'Build a record of media-query strings keyed by breakpoint name. Each value is a `min-width` query — `xs` is `(min-width: 0)`, `sm` becomes `(min-width: 640px)`, and so on. Used internally by `makeItResponsive()`; expose to consumers when they need to compose custom CSS-in-JS rules outside the responsive-prop pipeline.',
      example: `import { createMediaQueries, breakpoints } from '@pyreon/unistyle'

const queries = createMediaQueries(breakpoints())
// { xs: '@media (min-width: 0)', sm: '@media (min-width: 640px)', md: '@media (min-width: 768px)', ... }`,
      seeAlso: ['breakpoints', 'makeItResponsive'],
    },
    {
      name: 'makeItResponsive',
      kind: 'function',
      signature:
        'makeItResponsive<T>(options: { value: T | T[] | Record<string, T>; property: string; theme: Theme }): string',
      summary:
        'Resolve a responsive prop value to CSS for the current screen. Accepts three input shapes: single value (applies at all breakpoints), mobile-first array `[xs, sm, md, lg]` (each entry maps to the next breakpoint), or breakpoint object `{ xs: ..., md: ..., xl: ... }` (named keys map directly). The output is a CSS string with media queries already embedded; insert into a styled component template literal.',
      example: `import { makeItResponsive } from '@pyreon/unistyle'

makeItResponsive({ value: 16, property: 'padding', theme })
// → 'padding: 16px;'

makeItResponsive({ value: [8, 12, 16], property: 'padding', theme })
// → 'padding: 8px; @media (min-width: 640px) { padding: 12px } @media (min-width: 768px) { padding: 16px }'

makeItResponsive({ value: { xs: 8, md: 16, xl: 24 }, property: 'padding', theme })
// → '@media (min-width: 0) { padding: 8px } @media (min-width: 768px) { padding: 16px } @media (min-width: 1280px) { padding: 24px }'`,
      mistakes: [
        'Passing CSS-spec property names (`borderTopWidth`) — unistyle uses property-first naming (`borderWidthTop`); the responsive transformer expects the unistyle convention',
        'Forgetting to pass an enriched theme — without `theme.breakpoints`, the array form falls back to the first value at every breakpoint',
      ],
      seeAlso: ['createMediaQueries', 'styles'],
    },
    {
      name: 'styles',
      kind: 'function',
      signature: 'styles(theme: Theme): string',
      summary:
        'Generate the CSS string for a complete theme — colors, spacing, fonts, breakpoints, the works. Used to produce the cascade of CSS variables / global declarations that backs every styled component. Most consumers don\\\'t call this directly; the `PyreonUI` provider invokes it internally on theme mount.',
      example: `import { styles, enrichTheme } from '@pyreon/unistyle'

const theme = enrichTheme({ colors: { primary: '#3b82f6' } })
const css = styles(theme)
// → ':root { --color-primary: #3b82f6; --spacing-xs: 4px; ... }'`,
      seeAlso: ['enrichTheme', 'extendCss'],
    },
    {
      name: 'alignContent',
      kind: 'function',
      signature:
        "alignContent(options: { alignX?: AlignXKey; alignY?: AlignYKey; direction?: 'row' | 'column' | 'inline' | 'rows' }): string",
      summary:
        'Resolve `alignX` / `alignY` / `direction` shorthand to the matching flex / grid CSS (`justify-content`, `align-items`). The Element / Row / Column primitives use this internally — it\\\'s exposed for custom layout components that want the same alignment semantics. `direction: "inline"` maps to `row`; `direction: "rows"` maps to `column`.',
      example: `import { alignContent } from '@pyreon/unistyle'

alignContent({ alignX: 'center', alignY: 'start', direction: 'row' })
// → 'justify-content: center; align-items: flex-start;'

alignContent({ alignX: 'spaceBetween', direction: 'inline' })
// → 'justify-content: space-between;'`,
      seeAlso: ['makeItResponsive'],
    },
    {
      name: 'extendCss',
      kind: 'function',
      signature: 'extendCss(base: ExtendCss, override?: ExtendCss): ExtendCss',
      summary:
        'Extend a CSS definition (theme block, style descriptor) with overrides — deep-merges nested objects without losing the base. Used by rocketstyle dimension chains to layer dimension-specific CSS over a baseline. The base is not mutated; the result is a new object.',
      example: `import { extendCss } from '@pyreon/unistyle'

const base = { color: 'red', hover: { color: 'darkred' } }
const extended = extendCss(base, { hover: { background: 'pink' } })
// → { color: 'red', hover: { color: 'darkred', background: 'pink' } }`,
      seeAlso: ['styles'],
    },
    {
      name: 'stripUnit',
      kind: 'function',
      signature: 'stripUnit(value: string | number): number',
      summary:
        'Strip the unit suffix from a CSS value and return the numeric part (`"16px"` → `16`, `"1.5rem"` → `1.5`). Returns the input unchanged when already a number. Useful for arithmetic on theme values declared as strings (`"16px"`) without manually parsing.',
      example: `import { stripUnit } from '@pyreon/unistyle'

stripUnit('16px')   // → 16
stripUnit('1.5rem') // → 1.5
stripUnit(16)       // → 16`,
      seeAlso: ['value', 'values'],
    },
    {
      name: 'value',
      kind: 'function',
      signature: 'value(input: PropertyValue, fallback?: PropertyValue): UnitValue',
      summary:
        'Parse and validate a single property value into a `UnitValue` shape (`{ value, unit }`). Accepts numbers (treated as pixels), strings with units (`"16px"`, `"1rem"`, `"50%"`), or objects already in `UnitValue` form. Optional `fallback` is returned when the input is invalid. The companion `values()` does the same over an array.',
      example: `import { value } from '@pyreon/unistyle'

value(16)         // → { value: 16, unit: 'px' }
value('1.5rem')   // → { value: 1.5, unit: 'rem' }
value('50%')      // → { value: 50, unit: '%' }
value('garbage', 0) // → { value: 0, unit: 'px' }`,
      seeAlso: ['stripUnit', 'values'],
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
