---
title: "Responsive CSS Utilities — API Reference"
description: "Responsive breakpoints, CSS property mappings, unit utilities, theme enrichment"
---

# @pyreon/unistyle — API Reference

> **Generated** from `unistyle`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [unistyle](/docs/unistyle).

Foundational responsive-style layer that powers every visual package above it (`elements`, `rocketstyle`, `coolgrid`, `kinetic`). `enrichTheme()` merges a partial user theme with the default breakpoints / spacing / unit utilities so the rest of the system has a complete theme to read. `makeItResponsive()` turns a value or per-breakpoint map into the right CSS for the current screen. `createMediaQueries()` builds breakpoint-keyed media queries; `styles()` generates CSS from a theme; `alignContent()` resolves alignment shorthand to flex / grid CSS. The package is the single source of truth for responsive prop semantics across the UI system.

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`enrichTheme`](#enrichtheme) | function | Merge a partial theme with the full default theme (breakpoints, spacing, unit utilities, fallback colors). |
| [`breakpoints`](#breakpoints) | function | Return the default breakpoint set keyed by name (`xs`, `sm`, `md`, `lg`, `xl`, `xxl`) with min-width values in pixels. |
| [`createMediaQueries`](#createmediaqueries) | function | Build a record of media-query strings keyed by breakpoint name. |
| [`makeItResponsive`](#makeitresponsive) | function | Resolve a responsive prop value to CSS for the current screen. |
| [`styles`](#styles) | function | Generate the CSS string for a complete theme — colors, spacing, fonts, breakpoints, the works. |
| [`alignContent`](#aligncontent) | function | Resolve `alignX` / `alignY` / `direction` shorthand to the matching flex / grid CSS (`justify-content`, `align-items`). |
| [`extendCss`](#extendcss) | function | Extend a CSS definition (theme block, style descriptor) with overrides — deep-merges nested objects without losing the b |
| [`stripUnit`](#stripunit) | function | Strip the unit suffix from a CSS value and return the numeric part (`"16px"` → `16`, `"1.5rem"` → `1.5`). |
| [`value`](#value) | function | Parse and validate a single property value into a `UnitValue` shape (`{ value, unit }`). |
| [`themeToCssVars`](#themetocssvars) | function | Autogenerate CSS custom properties from a plain theme JSON. |
| [`resolveCssVarReferences`](#resolvecssvarreferences) | function | Resolve `var(--…)` references in a string back to their raw emitted values using a `themeToCssVars` registry — for consu |

## API

### enrichTheme `function`

```ts
enrichTheme(theme: PartialTheme): Theme
```

Merge a partial theme with the full default theme (breakpoints, spacing, unit utilities, fallback colors). Always call this before passing a user theme to `PyreonUI` — raw theme objects miss the default breakpoints and spacing scale that the rest of the UI system reads from. Idempotent: enriching an already-enriched theme is a no-op.

**Example**

```tsx
import { enrichTheme } from "@pyreon/unistyle"

const theme = enrichTheme({
  colors: { primary: "#3b82f6", secondary: "#6366f1" },
  fonts: { body: "Inter, sans-serif" },
})

// Merges user overrides with default breakpoints, spacing, and units
```

**Common mistakes**

- Passing the raw partial theme to `<PyreonUI theme={...}>` without enriching — `theme.breakpoints` is undefined and every responsive prop falls back to the desktop value
- Mutating the theme after passing it to `PyreonUI` — the styler resolver caches off the theme identity; clone + re-enrich for whole-theme swaps

**See also:** `breakpoints` · `createMediaQueries`

---

### breakpoints `function`

```ts
breakpoints(): Breakpoints
```

Return the default breakpoint set keyed by name (`xs`, `sm`, `md`, `lg`, `xl`, `xxl`) with min-width values in pixels. The same map is folded into `enrichTheme()` output, so most consumers read `theme.breakpoints` rather than calling this directly. Use it when you need the defaults outside a theme context (e.g. building a custom theme programmatically).

**Example**

```tsx
import { breakpoints } from '@pyreon/unistyle'

const bp = breakpoints()
// { xs: 0, sm: 640, md: 768, lg: 1024, xl: 1280, xxl: 1536 }
```

**See also:** `enrichTheme` · `createMediaQueries`

---

### createMediaQueries `function`

```ts
createMediaQueries(breakpoints: Breakpoints): Record<string, string>
```

Build a record of media-query strings keyed by breakpoint name. Each value is a `min-width` query — `xs` is `(min-width: 0)`, `sm` becomes `(min-width: 640px)`, and so on. Used internally by `makeItResponsive()`; expose to consumers when they need to compose custom CSS-in-JS rules outside the responsive-prop pipeline.

**Example**

```tsx
import { createMediaQueries, breakpoints } from '@pyreon/unistyle'

const queries = createMediaQueries(breakpoints())
// { xs: '@media (min-width: 0)', sm: '@media (min-width: 640px)', md: '@media (min-width: 768px)', ... }
```

**See also:** `breakpoints` · `makeItResponsive`

---

### makeItResponsive `function`

```ts
makeItResponsive<T>(options: { value: T | T[] | Record<string, T>; property: string; theme: Theme }): string
```

Resolve a responsive prop value to CSS for the current screen. Accepts three input shapes: single value (applies at all breakpoints), mobile-first array `[xs, sm, md, lg]` (each entry maps to the next breakpoint), or breakpoint object `{ xs: ..., md: ..., xl: ... }` (named keys map directly). The output is a CSS string with media queries already embedded; insert into a styled component template literal.

**Example**

```tsx
import { makeItResponsive } from '@pyreon/unistyle'

makeItResponsive({ value: 16, property: 'padding', theme })
// → 'padding: 16px;'

makeItResponsive({ value: [8, 12, 16], property: 'padding', theme })
// → 'padding: 8px; @media (min-width: 640px) { padding: 12px } @media (min-width: 768px) { padding: 16px }'

makeItResponsive({ value: { xs: 8, md: 16, xl: 24 }, property: 'padding', theme })
// → '@media (min-width: 0) { padding: 8px } @media (min-width: 768px) { padding: 16px } @media (min-width: 1280px) { padding: 24px }'
```

**Common mistakes**

- Passing CSS-spec property names (`borderTopWidth`) — unistyle uses property-first naming (`borderWidthTop`); the responsive transformer expects the unistyle convention
- Forgetting to pass an enriched theme — without `theme.breakpoints`, the array form falls back to the first value at every breakpoint

**See also:** `createMediaQueries` · `styles`

---

### styles `function`

```ts
styles(theme: Theme): string
```

Generate the CSS string for a complete theme — colors, spacing, fonts, breakpoints, the works. Used to produce the cascade of CSS variables / global declarations that backs every styled component. Most consumers don\'t call this directly; the `PyreonUI` provider invokes it internally on theme mount.

**Example**

```tsx
import { styles, enrichTheme } from '@pyreon/unistyle'

const theme = enrichTheme({ colors: { primary: '#3b82f6' } })
const css = styles(theme)
// → ':root { --color-primary: #3b82f6; --spacing-xs: 4px; ... }'
```

**See also:** `enrichTheme` · `extendCss`

---

### alignContent `function`

```ts
alignContent(options: { alignX?: AlignXKey; alignY?: AlignYKey; direction?: 'row' | 'column' | 'inline' | 'rows' }): string
```

Resolve `alignX` / `alignY` / `direction` shorthand to the matching flex / grid CSS (`justify-content`, `align-items`). The Element / Row / Column primitives use this internally — it\'s exposed for custom layout components that want the same alignment semantics. `direction: "inline"` maps to `row`; `direction: "rows"` maps to `column`.

**Example**

```tsx
import { alignContent } from '@pyreon/unistyle'

alignContent({ alignX: 'center', alignY: 'start', direction: 'row' })
// → 'justify-content: center; align-items: flex-start;'

alignContent({ alignX: 'spaceBetween', direction: 'inline' })
// → 'justify-content: space-between;'
```

**See also:** `makeItResponsive`

---

### extendCss `function`

```ts
extendCss(base: ExtendCss, override?: ExtendCss): ExtendCss
```

Extend a CSS definition (theme block, style descriptor) with overrides — deep-merges nested objects without losing the base. Used by rocketstyle dimension chains to layer dimension-specific CSS over a baseline. The base is not mutated; the result is a new object.

**Example**

```tsx
import { extendCss } from '@pyreon/unistyle'

const base = { color: 'red', hover: { color: 'darkred' } }
const extended = extendCss(base, { hover: { background: 'pink' } })
// → { color: 'red', hover: { color: 'darkred', background: 'pink' } }
```

**See also:** `styles`

---

### stripUnit `function`

```ts
stripUnit(value: string | number): number
```

Strip the unit suffix from a CSS value and return the numeric part (`"16px"` → `16`, `"1.5rem"` → `1.5`). Returns the input unchanged when already a number. Useful for arithmetic on theme values declared as strings (`"16px"`) without manually parsing.

**Example**

```tsx
import { stripUnit } from '@pyreon/unistyle'

stripUnit('16px')   // → 16
stripUnit('1.5rem') // → 1.5
stripUnit(16)       // → 16
```

**See also:** `value` · `values`

---

### value `function`

```ts
value(input: PropertyValue, fallback?: PropertyValue): UnitValue
```

Parse and validate a single property value into a `UnitValue` shape (`{ value, unit }`). Accepts numbers (treated as pixels), strings with units (`"16px"`, `"1rem"`, `"50%"`), or objects already in `UnitValue` form. Optional `fallback` is returned when the input is invalid. The companion `values()` does the same over an array.

**Example**

```tsx
import { value } from '@pyreon/unistyle'

value(16)         // → { value: 16, unit: 'px' }
value('1.5rem')   // → { value: 1.5, unit: 'rem' }
value('50%')      // → { value: 50, unit: '%' }
value('garbage', 0) // → { value: 0, unit: 'px' }
```

**See also:** `stripUnit` · `values`

---

### themeToCssVars `function`

```ts
themeToCssVars(theme: object, options?: { prefix?: string; exclude?: readonly string[]; units?: Record<string, CssVarsUnitPolicy>; rootSize?: number }): { vars, css, registry }
```

Autogenerate CSS custom properties from a plain theme JSON. Returns `vars` (same-shape tree with every eligible leaf replaced by a `var(--px-…)` reference string — plain strings, so they flow through the entire unistyle value pipeline untouched), `css` (a ready-to-inject `:root { … }` block), and `registry` (`varName → emitted value` for consumers that cannot evaluate `var()`, e.g. document export). Units are baked at EMISSION using the same `value()` conversion the pipeline applies today: `spacing.small: 8` emits `--px-spacing-small: 0.5rem`, so themes stay authored in pixels. Conventional length keys (`spacing`/`fontSize`/`headingSize`/`elementSize`/`borderRadius` → rem, `borderWidth` → px) convert by default; everything else emits verbatim so unitless scales (`lineHeight`, `ratio`, `zIndex`) keep working in `calc()` multiplication. Pure + WeakMap-cached per theme identity — repeated calls return the SAME result object.

**Example**

```tsx
import { themeToCssVars } from '@pyreon/unistyle'

const theme = { rootSize: 16, spacing: { small: 8 }, ratio: { medium: 1.5 } }
const { vars, css, registry } = themeToCssVars(theme)

vars.spacing.small               // 'var(--px-spacing-small)'
css                              // ':root {\n  --px-spacing-small: 0.5rem;\n  --px-ratio-medium: 1.5;\n}'
registry.get('--px-spacing-small') // '0.5rem'

// proportional sizing is native CSS — no extra machinery:
const width = `calc(${vars.spacing.small} * ${vars.ratio.medium})`
// custom scales opt into conversion per top-level key:
themeToCssVars(theme, { units: { mySizes: 'rem' } })
```

**Common mistakes**

- Doing JS arithmetic on a var leaf (`vars.spacing.small * 2` → NaN) — compose with native CSS calc instead: `` `calc(${vars.spacing.small} * 2)` ``
- Expecting `breakpoints` / `rootSize` to be tokenized — they are excluded by design (`@media` queries cannot read `var()`); JS consumes them at build/render time
- Using a var leaf for `backgroundImage` — CSS forbids `var()` inside `url(…)`; keep image URLs as raw values
- Forgetting to inject `css` — the function is pure; nothing lands on the page until the `:root` block reaches a style sink (`<style>` tag, `sheet.injectRules`, `createGlobalStyle`)
- Re-creating the theme object per render — results are WeakMap-cached by theme IDENTITY; a fresh object every call re-walks the tree and defeats downstream identity-keyed caches
- Assuming a custom top-level key converts to rem — only the conventional length keys convert by default; declare `units: { myScale: "rem" }` for custom scales

**See also:** `enrichTheme` · `value`

---

### resolveCssVarReferences `function`

```ts
resolveCssVarReferences<T>(input: T, registry: ReadonlyMap<string, string>): T
```

Resolve `var(--…)` references in a string back to their raw emitted values using a `themeToCssVars` registry — for consumers that cannot evaluate CSS custom properties (document export to PDF/DOCX/email, devtools, non-CSS render targets). Inline fallbacks (`var(--x, 1rem)`) apply when the name is unknown; unresolvable references stay verbatim; non-strings pass through untouched. `calc()` expressions are inlined, NOT evaluated.

**Example**

```tsx
import { resolveCssVarReferences, themeToCssVars } from '@pyreon/unistyle'

const { registry } = themeToCssVars(theme)
resolveCssVarReferences('var(--px-spacing-small)', registry)           // '0.5rem'
resolveCssVarReferences('calc(var(--px-spacing-small) * 2)', registry) // 'calc(0.5rem * 2)'
resolveCssVarReferences('var(--px-missing, 1rem)', registry)           // '1rem'
```

**Common mistakes**

- Expecting calc() to be EVALUATED — only the var() references inside are inlined; a non-CSS target needing one number must evaluate the calc itself or avoid calc-composed values
- Passing a registry from a DIFFERENT theme identity — registries are per themeToCssVars(theme) result; mixed registries resolve to wrong values

**See also:** `themeToCssVars`

---

## Package-level notes

> **Single source for responsive semantics:** Every visual package (`elements`, `rocketstyle`, `coolgrid`, `kinetic`) reads breakpoints / spacing / unit conventions from this package. Override defaults via `enrichTheme()` once at the app root rather than per-component.

> **CSS property naming:** Unistyle uses property-first naming (`borderWidthTop`, `borderColorLeft`) rather than CSS-spec order (`borderTopWidth`, `borderLeftColor`). Stick to the unistyle convention when authoring components — the responsive transformer expects it.
