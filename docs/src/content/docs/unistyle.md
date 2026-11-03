---
title: Unistyle
description: Responsive design utilities with breakpoints, media queries, unit conversion, and responsive value normalization.
---

`@pyreon/unistyle` provides a set of responsive design primitives for building adaptive UIs. It includes a breakpoint system, media query generation, responsive value normalization, and CSS unit conversion helpers. These utilities form the foundation for Pyreon's styling system and can be used standalone or integrated with `@pyreon/styler`.

<PackageBadge name="@pyreon/unistyle" href="/docs/unistyle" />

## Installation

:::code-group

```bash [npm]
npm install @pyreon/unistyle
```

```bash [bun]
bun add @pyreon/unistyle
```

```bash [pnpm]
pnpm add @pyreon/unistyle
```

```bash [yarn]
yarn add @pyreon/unistyle
```

:::

## Breakpoints

### Default Breakpoints

The package ships a default set of mobile-first breakpoints:

| Name  | Min Width | Target Devices                      |
| ----- | --------- | ----------------------------------- |
| `xs`  | 0px       | Phones (portrait)                   |
| `sm`  | 576px     | Phones (landscape), small tablets   |
| `md`  | 768px     | Tablets (portrait)                  |
| `lg`  | 992px     | Tablets (landscape), small desktops |
| `xl`  | 1200px    | Desktops                            |
| `xxl` | 1440px    | Large desktops, ultrawide monitors  |

The export is `breakpoints`. It carries the root font size next to the map, in the same shape a theme uses:

```ts
import { breakpoints } from '@pyreon/unistyle'

breakpoints.rootSize // 16
breakpoints.breakpoints
// { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1440 }
```

Because a theme reads `rootSize` and `breakpoints` at its top level, you can spread the default object into your theme:

```ts
const theme = { ...breakpoints, colors: { primary: '#2563eb' } }
```

The `Breakpoints` type is `typeof breakpoints`.

<Example file="./examples/unistyle/live-breakpoint-detection" title="Live Breakpoint Detection" />

### `sortBreakpoints(bps)`

Returns the breakpoint **names** sorted ascending by their pixel value. The responsive pipeline uses this order to map array positions and to emit media queries smallest-first.

```ts
import { sortBreakpoints } from '@pyreon/unistyle'

sortBreakpoints({ md: 768, xs: 0, xl: 1200, sm: 576 })
// ['xs', 'sm', 'md', 'xl']

sortBreakpoints({}) // []
```

## Media Queries

### `createMediaQueries({ breakpoints, rootSize, css })`

Builds one tagged-template helper per breakpoint. Each helper runs your CSS through the `css` function you pass in and wraps it in a mobile-first `min-width` query in `em` units, so the query respects the user's browser font-size setting. A breakpoint whose value is `0` gets no query: its helper returns the CSS unwrapped.

```ts
import { css } from '@pyreon/styler'
import { breakpoints, createMediaQueries } from '@pyreon/unistyle'

const media = createMediaQueries({
  breakpoints: breakpoints.breakpoints,
  rootSize: breakpoints.rootSize,
  css,
})

const container = css`
  padding: 8px;
  ${media.md`padding: 16px;`};
  ${media.lg`padding: 24px;`};
`
// media.md wraps its CSS in: @media only screen and (min-width: 48em) { … }
```

The em value is `px / rootSize`. With the defaults:

| Breakpoint | Pixels | Calculation | Em Value   |
| ---------- | ------ | ----------- | ---------- |
| xs         | 0      | —           | (no query) |
| sm         | 576    | 576 / 16    | 36em       |
| md         | 768    | 768 / 16    | 48em       |
| lg         | 992    | 992 / 16    | 62em       |
| xl         | 1200   | 1200 / 16   | 75em       |
| xxl        | 1440   | 1440 / 16   | 90em       |

A different `rootSize` changes the divisor: `{ md: 768 }` with `rootSize: 10` produces `min-width: 76.8em`.

### `enrichTheme(theme)`

You rarely call `createMediaQueries` yourself. `enrichTheme` reads a theme's `breakpoints` and `rootSize` and adds a `__PYREON__` block holding the sorted breakpoint names and the media helpers (built with the `css` function configured in `@pyreon/ui-core`). `makeItResponsive` reads that block. `<PyreonUI theme={…}>` enriches its theme automatically.

```ts
import { enrichTheme } from '@pyreon/unistyle'

const enriched = enrichTheme({ rootSize: 16, breakpoints: { xs: 0, sm: 576, md: 768 } })
enriched.__PYREON__.sortedBreakpoints // ['xs', 'sm', 'md']
enriched.__PYREON__.media.sm // tagged template for @media … (min-width: 36em)
```

A theme without breakpoints gets `__PYREON__` with both fields `undefined`, and styles then render once with no media queries.

## Responsive Values

### `ResponsiveValue<T>` Type

```ts
type ResponsiveValue<T> = T | T[] | Record<string, T>
```

A responsive value takes one of three forms:

```ts
import type { ResponsiveValue } from '@pyreon/unistyle'

// Scalar: the same value at every breakpoint
const a: ResponsiveValue<number> = 16

// Array: mobile-first, position i maps to the i-th sorted breakpoint
const b: ResponsiveValue<number> = [14, 14, 16]

// Object: keyed by breakpoint name, only where the value changes
const c: ResponsiveValue<string> = { xs: 'column', md: 'row' }
```

In both the array and object forms a missing or `null` slot inherits the previous breakpoint's value. `0` and `false` are real values, not gaps.

### `normalizeTheme({ theme, breakpoints })`

Expands every value in a theme into a full per-breakpoint map. `breakpoints` is the sorted list of names (the output of `sortBreakpoints`). If no value in the theme is an array or an object, the theme is returned unchanged. Keys whose value is `null` or `undefined` are dropped.

```ts
import { normalizeTheme } from '@pyreon/unistyle'

normalizeTheme({
  theme: {
    fontSize: [14, null, 16],
    color: { xs: 'red', md: 'blue' },
    lineHeight: 1.5,
  },
  breakpoints: ['xs', 'sm', 'md', 'lg'],
})
// {
//   fontSize:   { xs: 14,    sm: 14,    md: 16,     lg: 16 },
//   color:      { xs: 'red', sm: 'red', md: 'blue', lg: 'blue' },
//   lineHeight: { xs: 1.5,   sm: 1.5,   md: 1.5,    lg: 1.5 },
// }
```

### `transformTheme({ theme, breakpoints })`

Pivots a property-per-breakpoint theme into a breakpoint-per-property theme, which is the shape media queries are emitted from. Arrays map by position, objects by key, and scalars go to the first breakpoint. Breakpoints that end up with no properties are omitted.

```ts
import { transformTheme } from '@pyreon/unistyle'

transformTheme({
  theme: { fontSize: { xs: 14, md: 16 }, color: 'red' },
  breakpoints: ['xs', 'sm', 'md'],
})
// { xs: { fontSize: 14, color: 'red' }, md: { fontSize: 16 } }
```

### `makeItResponsive({ theme?, key?, css, styles, normalize? })`

The responsive engine behind every styled component in the ui-system (`elements`, `rocketstyle`, `coolgrid`). It returns a styled-component interpolation `(props) => …` that:

1. Reads the component's own theme from the `theme` option, or from `props[key]`.
2. Reads `breakpoints`, `rootSize` and `__PYREON__` from the provider theme (`props.theme`, enriched by `<PyreonUI>`).
3. With no breakpoints, renders `styles` once with no media queries.
4. Otherwise runs `normalizeTheme` (unless `normalize: false`), then `transformTheme`, then drops any breakpoint whose properties are identical to the previous one.
5. Renders `styles` once per remaining breakpoint, removes declarations that are unchanged from the previous breakpoint (mobile-first `min-width` queries already inherit them), and wraps each breakpoint's CSS with its media helper.

The output is cached per component theme object and per provider theme object, so a re-render with the same theme returns the previous result.

`styles` is a callback that receives one breakpoint's flat values:

```ts
import { css, styled } from '@pyreon/styler'
import { makeItResponsive, value } from '@pyreon/unistyle'
import type { MakeItResponsiveStyles } from '@pyreon/unistyle'

const boxStyles: MakeItResponsiveStyles = ({ theme: t, css, rootSize }) => css`
  ${t.padding != null && `padding: ${value(t.padding as number, rootSize)};`};
  ${t.color != null && `color: ${String(t.color)};`};
`

const Box = styled('div')`
  ${makeItResponsive({ key: '$box', styles: boxStyles, css })};
`

// <Box $box={{ padding: [8, 16, 24], color: { xs: 'black', md: 'navy' } }} />
```

A boolean or enum value that adds CSS only when it is truthy needs an explicit reset in its falsy branch (for example `align-self: ${t.block ? 'stretch' : 'auto'}`). Otherwise the declaration from a smaller breakpoint keeps applying at the larger one, because the delta step only removes repeated declarations and never adds resets.

### `styles({ theme, css, rootSize })`

Converts a unistyle theme object (camelCase CSS properties plus shorthands such as `paddingX`, `borderRadiusTop` and `fullScreen`) into CSS. Rocketstyle `.theme()` values are rendered by passing it to `makeItResponsive` as the `styles` callback, so it runs once per breakpoint with that breakpoint's values. Numeric lengths go through `value()`, so they become rem.

## Unit Helpers

### `stripUnit(value, unitReturn?)`

Parses the number out of a CSS value. A string that is not a plain `<number><unit>` is returned unchanged, and so is a number.

```ts
import { stripUnit } from '@pyreon/unistyle'

stripUnit('16px') // => 16
stripUnit('2.5rem') // => 2.5
stripUnit('50%') // => 50
stripUnit('-10px') // => -10
stripUnit('0') // => 0
stripUnit(16) // => 16

// Not a <number><unit> string: returned as-is
stripUnit('auto') // => 'auto'
stripUnit('calc(100% - 8px)') // => 'calc(100% - 8px)'
```

With `unitReturn = true` it returns a `[value, unit]` tuple:

```ts
stripUnit('16px', true) // => [16, 'px']
stripUnit('100%', true) // => [100, '%']
stripUnit('42', true) // => [42, '']
stripUnit('auto', true) // => ['auto', undefined]
stripUnit(16, true) // => [16, undefined]
```

### `value(val, rootSize = 16, outputUnit = 'rem')`

Converts a number or string to a CSS value. The return type is `string | number | null`. The conversion rules are:

| Input                                | Output      | Rule                                                                   |
| ------------------------------------ | ----------- | ---------------------------------------------------------------------- |
| `0`                                  | `0`         | Zero is always unitless                                                |
| unitless number `n`                  | `'(n/rootSize)rem'` | Divided by `rootSize` (default 16) and emitted in `rem`        |
| `'<n>px'` string                     | `'(n/rootSize)rem'` | A `px` string is converted to rem                             |
| other-unit string (`'2em'`, `'50%'`) | Passthrough | Returned verbatim                                                      |
| non-numeric string (`'calc(…)'`, `'var(…)'`, `'auto'`) | Passthrough | Returned verbatim — how `themeToCssVars` var leaves flow through |
| `null` / `undefined` / `''`          | `null`      | Not a value                                                            |

```ts
import { value } from '@pyreon/unistyle'

// Unitless numbers are divided by rootSize (default 16) and emitted in rem
value(16) // => '1rem'      (16 / 16)
value(24) // => '1.5rem'
value(8) // => '0.5rem'
value(0) // => 0            (always unitless)

// A px string is converted to rem; other units pass through
value('16px') // => '1rem'
value('2em') // => '2em'
value('50%') // => '50%'
value('calc(100% - 8px)') // => 'calc(100% - 8px)'  (verbatim passthrough)
value('auto') // => 'auto'

// Negative numbers follow the same px→rem division
value(-16) // => '-1rem'
value(-10) // => '-0.625rem'

// The second parameter is rootSize (the divisor); the third is the output unit
value(20, 20) // => '1rem'   (20 / rootSize 20)
value(16, 16, 'px') // => '16px'  (keep a unitless number in px)
```

**Design rationale:** authoring in raw pixel numbers (`padding: 16`, `fontSize: 24`) is natural, and `value()` turns every unitless number into a `rootSize`-relative `rem` so a single root-font-size change rescales the whole UI. `0` stays unitless (a bare `0` needs no unit), and any string that already carries a unit — or that isn't a plain `<number><unit>` shape at all (`calc(…)`, `var(…)`, `clamp(…)`) — passes through untouched, which is exactly what lets `themeToCssVars` var leaves survive the value pipeline.

**The `rootSize` parameter** is the px→rem divisor (default 16). It is load-bearing — `value(16)` is `'1rem'` at `rootSize: 16` but `'0.8rem'` at `rootSize: 20`.


### `values(items, rootSize?, outputUnit?)`

Takes an **array** of candidates, picks the first one that is not `null` or `undefined`, and converts it with `value()`. If the picked entry is itself an array, each element is converted and the results are joined with spaces. If nothing is defined, the result is `null`.

```ts
import { values } from '@pyreon/unistyle'

values([undefined, null, 16]) // => '1rem'
values([0, 16]) // => 0        (0 is a value, not a gap)
values([undefined, '50%']) // => '50%'
values([[8, 16]]) // => '0.5rem 1rem'
values([undefined, undefined]) // => null
```

**Practical use in a component:**

```ts
import { values } from '@pyreon/unistyle'

interface BoxProps {
  padding?: number | string
  paddingX?: number | string
  paddingLeft?: number | string
}

function resolveBoxStyles(props: BoxProps) {
  return {
    // Most specific wins: paddingLeft > paddingX > padding
    paddingLeft: values([props.paddingLeft, props.paddingX, props.padding]),
    paddingRight: values([props.paddingX, props.padding]),
    paddingTop: values([props.padding]),
  }
}

resolveBoxStyles({ padding: 16, paddingX: 32 })
// { paddingLeft: '2rem', paddingRight: '2rem', paddingTop: '1rem' }
```

## CSS Variables from a Theme

`themeToCssVars()` autogenerates CSS custom properties from a plain theme JSON. Every eligible leaf is replaced by a `var(--px-…)` reference string; you get a ready-to-inject `:root` block and a `varName → value` registry for consumers that can't evaluate `var()` (document export, devtools).

```ts
import { themeToCssVars } from '@pyreon/unistyle'

const theme = { rootSize: 16, spacing: { small: 8 }, ratio: { medium: 1.5 } }
const { vars, css, registry } = themeToCssVars(theme)

vars.spacing.small // 'var(--px-spacing-small)'
css
// :root {
//   --px-spacing-small: 0.5rem;
//   --px-ratio-medium: 1.5;
// }
registry.get('--px-spacing-small') // '0.5rem'
```

### Units are baked at emission

The same px→rem conversion the pipeline applies at render time runs once at emission, driven by `rootSize` — so themes stay authored in pixels and nothing downstream ever converts a var. Conventional length keys convert by default (`spacing`, `fontSize`, `headingSize`, `elementSize`, `borderRadius` → rem; `borderWidth` → px); everything else emits verbatim so unitless scales (`lineHeight`, `fontWeight`, `zIndex`, custom ratio keys) remain valid as `calc()` multipliers.

```ts
// custom scales opt into conversion per top-level key
themeToCssVars(theme, { units: { mySizes: 'rem' } })

// custom prefix
themeToCssVars(theme, { prefix: 'app' }) // var(--app-spacing-small)
```

### Proportional sizing with calc()

Because var leaves are plain strings, composing them is native CSS — no helper functions required:

```ts
const width = `calc(${vars.spacing.small} * ${vars.ratio.medium})`
// 'calc(var(--px-spacing-small) * var(--px-ratio-medium))'
```

### What is not tokenized

- `breakpoints` and `rootSize` — `@media` queries cannot read `var()`; JS consumes them at render time (override the exclusion list via `exclude`).
- Arrays, functions, booleans, `null`/`undefined`, empty strings, non-finite numbers — kept raw.
- Values destined for `backgroundImage` — CSS forbids `var()` inside `url(…)`.

### Enabling the ui-system mode

`themeToCssVars` is the standalone generator. The ui-system-wide switch lives on the shared config:

```ts
import { init } from '@pyreon/ui-core'

init({ cssVariables: true })
// or: init({ cssVariables: { prefix: 'app', attribute: 'data-mode' } })
```

With the flag on, `PyreonUI` generates + injects the variables automatically, provides the var-leaf theme tree to every consumer, and renders a layout-neutral `display: contents` wrapper carrying the mode attribute — a dark/light flip becomes a single attribute write (no re-resolution, no className changes), and rocketstyle's component-level `mode(a, b)` pairs become hashed var pairs resolved by the cascade. Set the flag at app boot, before the first render. One caveat: under the flag, `mode(a, b)` values should be unit-complete strings (`mode('8px', '12px')`) — pairs are emitted verbatim into CSS, so numeric values warn in dev.

### Pass-through contract

`var(` / `calc(` strings flow through the entire unistyle pipeline untouched — `value()`, `values()`, the edge and border-radius shorthands, `styles()`, and `makeItResponsive` all pass them through verbatim. This is a tested contract, which is what makes CSS-variable themes work in every package built on unistyle (`elements`, `rocketstyle`, `coolgrid`, `kinetic`).

The function is pure (returns `css` text, performs no injection) and WeakMap-cached by theme identity — repeated calls with the same theme object return the same result object. Name collisions after kebab-case normalization (`xSmall` vs `x-small` both produce `--px-…-x-small`) throw with a `[Pyreon]` error naming both paths.

## Custom Breakpoint Configuration

### Defining Custom Breakpoints

Breakpoints are read from the theme, so custom names and values only need to be set there. Every helper above takes whatever names you use:

```tsx
import { PyreonUI } from '@pyreon/ui-core'

const theme = {
  rootSize: 16,
  breakpoints: { phone: 0, tablet: 600, laptop: 1024, desktop: 1440 },
}

// <PyreonUI theme={theme}>…</PyreonUI>
// Responsive values now resolve against phone/tablet/laptop/desktop:
//   padding: [8, 16, 24]             → phone 8, tablet 16, laptop and up 24
//   padding: { phone: 8, laptop: 16 } → phone and tablet 8, laptop and up 16
```

Array positions follow the sorted order (`sortBreakpoints`), not the order you wrote the keys in.

### Minimal Breakpoint Set

A two-breakpoint setup works the same way:

```ts
const theme = { rootSize: 16, breakpoints: { mobile: 0, desktop: 768 } }
// desktop's media query is @media only screen and (min-width: 48em)
```

### Content-Based Breakpoints

Breakpoints do not have to align with device sizes:

```ts
const contentBreakpoints = {
  narrow: 0,
  readable: 540, // Optimal line length for body text
  wide: 900, // Room for sidebar
  spacious: 1200, // Multi-column layouts
}
```

## Integration with the UI System

`@pyreon/unistyle` is the layer the other ui-system packages build on:

- `<PyreonUI theme={…}>` (from `@pyreon/ui-core`) calls `enrichTheme` on the theme it provides, so `makeItResponsive` finds the sorted breakpoints and media helpers.
- `@pyreon/elements`, `@pyreon/coolgrid` and `@pyreon/rocketstyle` render their styles through `makeItResponsive`, which is why their layout props and `.theme()` values accept the scalar, array and object forms.
- Loading `@pyreon/unistyle` registers this engine with `@pyreon/ui-core`. Without it, `<PyreonUI>` falls back to a minimal engine (the theme passes through unenriched, with no CSS variables and no default breakpoints) and warns once in development.

## Real-World Responsive Layout Patterns

### Responsive Spacing System

```ts
import { value } from '@pyreon/unistyle'

// Define a spacing scale in px
const spacing = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32 } as const

type SpacingKey = keyof typeof spacing

function space(key: SpacingKey) {
  return value(spacing[key])
}

space(0) // => 0
space(1) // => '0.25rem'
space(4) // => '1rem'
space(8) // => '2rem'
```

### Responsive Component Props

Elements accept the responsive forms directly on their layout props:

```tsx
import { Element } from '@pyreon/elements'

<Element
  contentDirection={['rows', 'rows', 'inline']}
  contentAlignX={{ xs: 'center', md: 'left' }}
  gap={[8, 16]}
>
  {/* … */}
</Element>
```

## TypeScript Utility Types

### `ResponsiveValue<T>`

```ts
type ResponsiveValue<T> = T | T[] | Record<string, T>
```

A scalar, a mobile-first array, or an object keyed by breakpoint name.

### `Breakpoints`

```ts
type Breakpoints = typeof breakpoints
// { readonly rootSize: 16; readonly breakpoints: { readonly xs: 0; …; readonly xxl: 1440 } }
```

### Type-Safe Custom Breakpoints

```ts
const myBreakpoints = {
  phone: 0,
  tablet: 600,
  desktop: 1024,
} as const satisfies Record<string, number>

type MyBreakpointKey = keyof typeof myBreakpoints
// 'phone' | 'tablet' | 'desktop'

type MyResponsiveValue<T> = T | T[] | Partial<Record<MyBreakpointKey, T>>

const padding: MyResponsiveValue<number> = { phone: 8, tablet: 16, desktop: 24 }
```

## API Reference

| Export                                               | Description                                                                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `breakpoints`                                        | `{ rootSize: 16, breakpoints: { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1440 } }`                                                        |
| `sortBreakpoints(bps)`                               | Breakpoint names sorted ascending by pixel value                                                                                                  |
| `createMediaQueries({ breakpoints, rootSize, css })` | One tagged-template helper per breakpoint; non-zero breakpoints wrap the CSS in `@media only screen and (min-width: <px / rootSize>em)`            |
| `enrichTheme(theme)`                                 | Adds `__PYREON__.sortedBreakpoints` and `__PYREON__.media` to a theme                                                                             |
| `normalizeTheme({ theme, breakpoints })`             | Expands scalar, array and object values into per-breakpoint maps with forward fill                                                                |
| `transformTheme({ theme, breakpoints })`             | Pivots property-per-breakpoint into breakpoint-per-property                                                                                       |
| `makeItResponsive({ theme?, key?, css, styles, normalize? })` | Styled interpolation that renders `styles` per breakpoint inside media queries                                                           |
| `styles({ theme, css, rootSize })`                   | Converts a unistyle theme object (CSS properties and shorthands) to CSS                                                                          |
| `stripUnit(value, unitReturn?)`                      | Number from a `<number><unit>` string, or `[value, unit]` with `unitReturn`; other input is returned unchanged                                    |
| `value(val, rootSize = 16, outputUnit = 'rem')`      | Unitless numbers and `px` strings convert to rem (`16` → `1rem`); `0` and other units pass through; `null`/`undefined`/`''` return `null`         |
| `values(items, rootSize?, outputUnit?)`              | `value()` of the first non-null entry of `items`; an array entry is converted element-wise and space-joined                                       |
| `themeToCssVars(theme, options?)`                    | CSS custom properties from a theme (see above)                                                                                                    |
| `alignContent`, `extendCss`                          | Flex-alignment and extra-CSS helpers used by elements                                                                                             |

## Types Reference

| Type                     | Description                                                       |
| ------------------------ | ----------------------------------------------------------------- |
| `Breakpoints`            | `typeof breakpoints`                                              |
| `ResponsiveValue<T>`     | `T \| T[] \| Record<string, T>`                                   |
| `CreateMediaQueries`     | Type of `createMediaQueries`                                      |
| `MakeItResponsive`       | Type of `makeItResponsive`                                        |
| `MakeItResponsiveStyles` | The `styles` callback type: `({ theme, css, rootSize, globalTheme }) => css` |
| `NormalizeTheme`, `TransformTheme`, `SortBreakpoints` | Types of the matching functions                      |
| `StripUnit`, `Value`, `Values` | Types of the unit helpers                                   |
| `PyreonTheme`            | The theme shape (owned by `@pyreon/ui-core`, re-exported here)    |
