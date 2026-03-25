---
title: Unistyle
description: Responsive design utilities with breakpoints, media queries, unit conversion, and responsive value normalization.
---

`@pyreon/unistyle` provides a set of responsive design primitives for building adaptive UIs. It includes a breakpoint system, media query generation, responsive value normalization, and CSS unit conversion helpers. These utilities form the foundation for Pyreon's styling system and can be used standalone or integrated with `@pyreon/styler`.

<PackageBadge name="@pyreon/unistyle" href="/docs/unistyle" />

## Installation

::: code-group
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

The package ships with a default set of mobile-first breakpoints that follow common industry conventions:

| Name | Min Width | Target Devices |
|------|-----------|----------------|
| `xs` | 0px | Phones (portrait) |
| `sm` | 576px | Phones (landscape), small tablets |
| `md` | 768px | Tablets (portrait) |
| `lg` | 992px | Tablets (landscape), small desktops |
| `xl` | 1200px | Desktops |
| `xxl` | 1400px | Large desktops, ultrawide monitors |

```ts
import { defaultBreakpoints } from '@pyreon/unistyle'

console.log(defaultBreakpoints)
// { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1400 }
```

The breakpoint values are always in ascending order and the smallest breakpoint always starts at `0`.

### `BreakpointMap` Type

A `BreakpointMap` is a record mapping breakpoint names to pixel values:

```ts
type BreakpointMap = Record<string, number>
```

You can define custom breakpoint maps with any names and values:

```ts
import type { BreakpointMap } from '@pyreon/unistyle'

const customBreakpoints: BreakpointMap = {
  mobile: 0,
  tablet: 600,
  desktop: 1024,
  wide: 1440,
}
```

### `BreakpointKey` Type

A union type of the default breakpoint names:

```ts
type BreakpointKey = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl'
```

This is derived from `keyof typeof defaultBreakpoints` and is useful for type-safe access to default breakpoint values.

### `sortBreakpoints(bps)`

Returns breakpoints as sorted `[name, px]` tuples in ascending order by pixel value. This is the canonical way to iterate breakpoints from smallest to largest, regardless of the order they were defined.

```ts
import { sortBreakpoints } from '@pyreon/unistyle'

// Handles unsorted input
const bps = { md: 768, xs: 0, xl: 1200, sm: 576 }
const sorted = sortBreakpoints(bps)
// [['xs', 0], ['sm', 576], ['md', 768], ['xl', 1200]]
```

Edge cases:

```ts
// Single breakpoint
sortBreakpoints({ xs: 0 })
// [['xs', 0]]

// Empty map
sortBreakpoints({})
// []

// Already sorted — returns same order
sortBreakpoints({ xs: 0, sm: 576, md: 768 })
// [['xs', 0], ['sm', 576], ['md', 768]]
```

The full default set:

```ts
import { sortBreakpoints, defaultBreakpoints } from '@pyreon/unistyle'

const sorted = sortBreakpoints(defaultBreakpoints)
// [['xs', 0], ['sm', 576], ['md', 768], ['lg', 992], ['xl', 1200], ['xxl', 1400]]

// Destructure the tuples
for (const [name, minWidth] of sorted) {
  console.log(`${name}: ${minWidth}px`)
}
```

### `getBreakpoint(width, bps?)`

Returns the active breakpoint name for a given viewport width. Walks sorted breakpoints from smallest to largest and returns the last one whose min-width is less than or equal to the given width.

```ts
import { getBreakpoint } from '@pyreon/unistyle'

// Using default breakpoints
getBreakpoint(0)     // => 'xs'
getBreakpoint(100)   // => 'xs'
getBreakpoint(575)   // => 'xs'
getBreakpoint(576)   // => 'sm'  (exactly at threshold)
getBreakpoint(767)   // => 'sm'
getBreakpoint(768)   // => 'md'
getBreakpoint(991)   // => 'md'
getBreakpoint(992)   // => 'lg'
getBreakpoint(1199)  // => 'lg'
getBreakpoint(1200)  // => 'xl'
getBreakpoint(1399)  // => 'xl'
getBreakpoint(1400)  // => 'xxl'
getBreakpoint(2000)  // => 'xxl'
```

With custom breakpoints:

```ts
import type { BreakpointMap } from '@pyreon/unistyle'

const custom: BreakpointMap = { small: 0, large: 1000 }

getBreakpoint(500, custom)   // => 'small'
getBreakpoint(1000, custom)  // => 'large'
getBreakpoint(1500, custom)  // => 'large'
```

When the width is smaller than the smallest breakpoint, the smallest breakpoint name is still returned:

```ts
const custom: BreakpointMap = { tablet: 768, desktop: 1024 }
getBreakpoint(500, custom)  // => 'tablet' (below smallest, returns first)
```

### Practical Usage: Responsive Component

```tsx
import { getBreakpoint, defaultBreakpoints } from '@pyreon/unistyle'
import { signal, effect } from '@pyreon/reactivity'

// Track the current breakpoint reactively
const currentBreakpoint = signal(
  getBreakpoint(window.innerWidth)
)

window.addEventListener('resize', () => {
  currentBreakpoint.set(getBreakpoint(window.innerWidth))
})

// Use in a component
const Layout = defineComponent(() => {
  const bp = currentBreakpoint

  return () => {
    const isMobile = bp() === 'xs' || bp() === 'sm'

    return isMobile
      ? <MobileLayout />
      : <DesktopLayout />
  }
})
```

## Media Queries

### `createMediaQueries(bps, rootSize?)`

Generates mobile-first CSS media query strings from a breakpoint map. Uses `em` units rather than `px` for better accessibility -- `em`-based media queries respect the user's browser font-size setting.

The smallest breakpoint (value `0`) produces an empty string, since it applies to all widths and no media query is needed.

```ts
import { createMediaQueries, defaultBreakpoints } from '@pyreon/unistyle'

const queries = createMediaQueries(defaultBreakpoints)
// {
//   xs:  '',
//   sm:  '@media (min-width: 36em)',      // 576 / 16 = 36
//   md:  '@media (min-width: 48em)',      // 768 / 16 = 48
//   lg:  '@media (min-width: 62em)',      // 992 / 16 = 62
//   xl:  '@media (min-width: 75em)',      // 1200 / 16 = 75
//   xxl: '@media (min-width: 87.5em)',    // 1400 / 16 = 87.5
// }
```

**How px-to-em conversion works:**

The formula is `em = px / rootSize`. The default `rootSize` is `16` (the browser default font size). This means:

| Breakpoint | Pixels | Calculation | Em Value |
|------------|--------|-------------|----------|
| xs | 0 | 0 / 16 | (no query) |
| sm | 576 | 576 / 16 | 36em |
| md | 768 | 768 / 16 | 48em |
| lg | 992 | 992 / 16 | 62em |
| xl | 1200 | 1200 / 16 | 75em |
| xxl | 1400 | 1400 / 16 | 87.5em |

**Custom root size:**

If your application uses a non-standard root font size, pass it as the second parameter:

```ts
const queries = createMediaQueries({ xs: 0, md: 768 }, 10)
// { xs: '', md: '@media (min-width: 76.8em)' }
// 768 / 10 = 76.8
```

**With custom breakpoints:**

```ts
const customQueries = createMediaQueries({
  mobile: 0,
  tablet: 600,
  desktop: 1024,
})
// {
//   mobile:  '',
//   tablet:  '@media (min-width: 37.5em)',    // 600 / 16
//   desktop: '@media (min-width: 64em)',       // 1024 / 16
// }
```

**Edge cases:**

```ts
// Empty breakpoints
createMediaQueries({})
// {}

// Single zero breakpoint
createMediaQueries({ xs: 0 })
// { xs: '' }
```

### `createBetweenQuery(minPx, maxPx, rootSize?)`

Creates a media query that targets a specific range between two pixel values. The max value is reduced by `0.02px` to avoid overlap with the next breakpoint's `min-width` query.

```ts
import { createBetweenQuery } from '@pyreon/unistyle'

createBetweenQuery(768, 992)
// => '@media (min-width: 48em) and (max-width: 61.99875em)'
// min: 768 / 16 = 48
// max: (992 - 0.02) / 16 = 61.99875
```

This is useful for targeting a specific breakpoint range without affecting larger screens:

```ts
// Tablet only (md breakpoint range)
const tabletOnly = createBetweenQuery(768, 992)

// Tablet to small desktop
const tabletToDesktop = createBetweenQuery(768, 1200)

// Phone only
const phoneOnly = createBetweenQuery(0, 576)
// => '@media (min-width: 0em) and (max-width: 35.99875em)'
```

**Custom root size:**

```ts
createBetweenQuery(768, 1024, 10)
// min: 768 / 10 = 76.8em
// max: (1024 - 0.02) / 10 = 102.398em
// => '@media (min-width: 76.8em) and (max-width: 102.398em)'
```

**Why subtract 0.02px?**

The subtraction prevents a 1px overlap between the `max-width` of one range and the `min-width` of the next. For example, without the subtraction, `createBetweenQuery(768, 992)` would have `max-width: 62em` which overlaps with `@media (min-width: 62em)` for the `lg` breakpoint. The 0.02px gap is imperceptible but avoids the CSS specificity issue.

### Using Media Queries in CSS-in-JS

```ts
import { createMediaQueries, defaultBreakpoints } from '@pyreon/unistyle'

const mq = createMediaQueries(defaultBreakpoints)

// Build a responsive style object
function responsiveStyles() {
  return `
    .container {
      padding: 8px;
      ${mq.md} { padding: 16px; }
      ${mq.lg} { padding: 24px; }
      ${mq.xl} { padding: 32px; }
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
      ${mq.md} { grid-template-columns: repeat(2, 1fr); }
      ${mq.lg} { grid-template-columns: repeat(3, 1fr); }
      ${mq.xl} { grid-template-columns: repeat(4, 1fr); }
    }
  `
}
```

## Responsive Values

### `ResponsiveValue<T>` Type

A value that can be either a single scalar (applied to all breakpoints) or an object mapping breakpoint names to values:

```ts
type ResponsiveValue<T> = T | Partial<Record<string, T>>
```

Examples:

```ts
import type { ResponsiveValue } from '@pyreon/unistyle'

// Scalar: same value at all breakpoints
const fontSize: ResponsiveValue<number> = 16

// Object: different values per breakpoint
const fontSize: ResponsiveValue<number> = { xs: 14, md: 16, xl: 18 }

// Partial: only specify breakpoints that change
const padding: ResponsiveValue<number> = { xs: 8, lg: 16 }

// String values
const color: ResponsiveValue<string> = { xs: 'red', md: 'blue', xl: 'green' }

// Mixed: start with a value that persists until overridden
const display: ResponsiveValue<string> = { xs: 'block', md: 'flex' }
```

### `normalizeResponsive(value, bps)`

Expands a `ResponsiveValue` into a full breakpoint map. This function handles two cases:

**Scalar values** are applied to every breakpoint:

```ts
import { normalizeResponsive, defaultBreakpoints } from '@pyreon/unistyle'

normalizeResponsive(16, defaultBreakpoints)
// { xs: 16, sm: 16, md: 16, lg: 16, xl: 16, xxl: 16 }

normalizeResponsive('red', defaultBreakpoints)
// { xs: 'red', sm: 'red', md: 'red', lg: 'red', xl: 'red', xxl: 'red' }
```

**Object values** cascade forward -- if a breakpoint is not explicitly set, it inherits from the nearest previous breakpoint that is set:

```ts
normalizeResponsive({ xs: 14, md: 16, xl: 18 }, defaultBreakpoints)
// { xs: 14, sm: 14, md: 16, lg: 16, xl: 18, xxl: 18 }
//          ^^         ^^         ^^
//          inherits   inherits   inherits
//          from xs    from md    from xl
```

**Starting from a non-`xs` breakpoint:**

If the first defined key is not the smallest breakpoint, earlier breakpoints are omitted from the result (they have no defined value to inherit):

```ts
normalizeResponsive({ md: 16 }, defaultBreakpoints)
// { md: 16, lg: 16, xl: 16, xxl: 16 }
// xs and sm are NOT in the result — no value cascades into them
```

**Zero values cascade correctly:**

```ts
normalizeResponsive({ xs: 0, md: 16 }, defaultBreakpoints)
// { xs: 0, sm: 0, md: 16, lg: 16, xl: 16, xxl: 16 }
```

**Edge cases:**

```ts
// Null is treated as a scalar (not an object)
normalizeResponsive(null, defaultBreakpoints)
// { xs: null, sm: null, md: null, lg: null, xl: null, xxl: null }

// Arrays are treated as scalars (not objects)
normalizeResponsive([1, 2, 3], defaultBreakpoints)
// { xs: [1,2,3], sm: [1,2,3], md: [1,2,3], ... }

// Empty object
normalizeResponsive({}, defaultBreakpoints)
// {}

// Keys not in the breakpoint map are ignored
normalizeResponsive({ xs: 10, nonexistent: 99 } as any, defaultBreakpoints)
// { xs: 10, sm: 10, md: 10, lg: 10, xl: 10, xxl: 10 }
// "nonexistent" is silently dropped

// Empty breakpoint map
normalizeResponsive(42, {})
// {}

// Single breakpoint
normalizeResponsive(42, { only: 0 })
// { only: 42 }
```

### `makeResponsive(theme, bps, rootSize?)`

Transforms an object of responsive CSS properties into a CSS string with appropriate media query wrappers. This is the main high-level utility for generating responsive CSS.

**Property name conversion:** CamelCase property names are automatically converted to kebab-case.

**Value conversion:** Numeric values are suffixed with `px`. String values are passed through unchanged.

**Deduplication:** A CSS rule is only emitted at the breakpoint where the value changes from the previous breakpoint. This avoids redundant CSS.

```ts
import { makeResponsive, defaultBreakpoints } from '@pyreon/unistyle'

const css = makeResponsive({
  fontSize: { xs: 14, md: 16, xl: 18 },
  padding: { xs: 8, lg: 16 },
  lineHeight: 1.5,
}, defaultBreakpoints)
```

The output CSS is:

```
font-size: 14px; padding: 8px; line-height: 1.5;
@media (min-width: 48em) { font-size: 16px; }
@media (min-width: 62em) { padding: 16px; }
@media (min-width: 75em) { font-size: 18px; }
```

Notice:
- `fontSize: 14px` and `padding: 8px` appear in the base (no media query) because they start at `xs`
- `lineHeight: 1.5` appears once in the base because it is a scalar
- `fontSize` changes at `md` and `xl`, so media queries are emitted only at those breakpoints
- `padding` only changes at `lg`, so a single media query is emitted there
- No redundant `padding: 8px` rules at `sm` or `md` since the value hasn't changed

**Multiple properties at the same breakpoint are grouped:**

```ts
makeResponsive({
  fontSize: { xs: 14, md: 18 },
  color: { xs: 'red', md: 'blue' },
}, defaultBreakpoints)
// "font-size: 14px; color: red;
//  @media (min-width: 48em) { font-size: 18px; color: blue; }"
```

**Scalar values (applied to all breakpoints):**

```ts
makeResponsive({ fontSize: 16, color: 'red' }, defaultBreakpoints)
// "font-size: 16px; color: red;"
// No media queries — values are constant across all breakpoints
```

**String values pass through:**

```ts
makeResponsive({ display: 'flex', justifyContent: 'center' }, defaultBreakpoints)
// "display: flex; justify-content: center;"
```

**Custom root size for media queries:**

```ts
makeResponsive(
  { color: { xs: 'red', md: 'blue' } },
  defaultBreakpoints,
  10 // root font size = 10px
)
// "color: red; @media (min-width: 76.8em) { color: blue; }"
// 768 / 10 = 76.8em
```

**Edge cases:**

```ts
// Empty theme
makeResponsive({}, defaultBreakpoints)
// ""

// Empty breakpoints
makeResponsive({ fontSize: 16 }, {})
// ""
```

### Complex Responsive Layout Example

```ts
import { makeResponsive, defaultBreakpoints } from '@pyreon/unistyle'

// A card component with fully responsive styling
const cardStyles = makeResponsive({
  // Layout
  display: 'flex',
  flexDirection: { xs: 'column', md: 'row' },
  gap: { xs: 8, md: 16, xl: 24 },

  // Spacing
  padding: { xs: 12, sm: 16, lg: 24, xl: 32 },
  margin: { xs: 8, md: 0 },

  // Typography
  fontSize: { xs: 14, md: 16, xl: 18 },

  // Sizing
  maxWidth: { xs: '100%', md: 720, lg: 960, xl: 1200 },

  // Visual
  borderRadius: { xs: 8, md: 12 },
}, defaultBreakpoints)
```

This produces optimized CSS with media queries only at breakpoints where values actually change.

### Responsive Grid System

```ts
function createGridStyles(columns: ResponsiveValue<number>) {
  const bps = defaultBreakpoints

  return makeResponsive({
    display: 'grid',
    gap: { xs: 8, md: 16, xl: 24 },
    gridTemplateColumns: (() => {
      // Convert column counts to CSS grid-template-columns
      const normalized = normalizeResponsive(columns, bps)
      const result: Partial<Record<string, string>> = {}
      for (const [bp, cols] of Object.entries(normalized)) {
        result[bp] = `repeat(${cols}, 1fr)`
      }
      return result
    })(),
  }, bps)
}

// Usage:
const gridCss = createGridStyles({ xs: 1, sm: 2, md: 3, xl: 4 })
```

## Unit Helpers

### `stripUnit(value)`

Parses a CSS value string into its numeric part. Supports an overloaded signature: without the `returnUnit` flag it returns just the number, with it returns a `[number, string]` tuple.

**Number only (default):**

```ts
import { stripUnit } from '@pyreon/unistyle'

stripUnit('16px')      // => 16
stripUnit('2.5rem')    // => 2.5
stripUnit('2em')       // => 2
stripUnit('50%')       // => 50
stripUnit('100vh')     // => 100
stripUnit('0')         // => 0
stripUnit('-10px')     // => -10
stripUnit('1.5em')     // => 1.5
stripUnit('0.5rem')    // => 0.5
```

**With unit (returnUnit = true):**

```ts
stripUnit('16px', true)      // => [16, 'px']
stripUnit('2.5rem', true)    // => [2.5, 'rem']
stripUnit('100%', true)      // => [100, '%']
stripUnit('1.5em', true)     // => [1.5, 'em']
stripUnit('42', true)        // => [42, '']  (unitless)
stripUnit('-10px', true)     // => [-10, 'px']
stripUnit('0.5rem', true)    // => [0.5, 'rem']
```

**Edge cases:**

```ts
// Non-numeric strings return 0
stripUnit('auto')        // => 0
stripUnit('auto', true)  // => [0, '']

// Empty string
stripUnit('')            // => 0
stripUnit('', true)      // => [0, '']
```

**TypeScript overloads:**

```ts
// The function has two overloaded signatures:
function stripUnit(value: string): number
function stripUnit(value: string, returnUnit: true): [number, string]
```

This means TypeScript correctly narrows the return type based on the second argument.

### `value(val, rootSize?)`

Converts a number or string to a CSS value string. The conversion rules are:

| Input | Output | Rule |
|-------|--------|------|
| String | Passthrough | Strings are returned unchanged |
| `0` | `'0'` | Zero is always just `'0'` |
| `0 < \|n\| <= 1` | `'Nrem'` | Fractional values are treated as rem multipliers |
| `\|n\| > 1` | `'Npx'` | Numbers greater than 1 become pixels |

```ts
import { value } from '@pyreon/unistyle'

// Strings pass through unchanged
value('2rem')     // => '2rem'
value('50%')      // => '50%'
value('100vh')    // => '100vh'
value('auto')     // => 'auto'
value('2em')      // => '2em'

// Zero
value(0)          // => '0'

// Fractional (0 < |n| <= 1) → rem
value(0.5)        // => '0.5rem'
value(1)          // => '1rem'
value(0.25)       // => '0.25rem'

// Greater than 1 → px
value(16)         // => '16px'
value(32)         // => '32px'
value(100)        // => '100px'

// Negative values follow the same rules
value(-0.5)       // => '-0.5rem'
value(-1)         // => '-1rem'
value(-10)        // => '-10px'
```

**Design rationale:** The `value()` function implements a convention where small numbers (0-1) represent relative sizing (rem) and larger numbers represent absolute sizing (px). This makes it natural to write:

```ts
value(0.5)   // Half a rem — relative to root font size
value(16)    // 16 pixels — absolute
```

**The `rootSize` parameter:** The second parameter exists for future extensibility but does not currently affect the output.

### `values(...vals)`

Picks the first defined (non-null, non-undefined) value from a list and converts it using `value()`. Useful for resolving prop fallbacks in component APIs.

```ts
import { values } from '@pyreon/unistyle'

// Basic fallback chain
values(undefined, null, 16)      // => '16px'
values(0.5, 16)                   // => '0.5rem' (first defined wins)
values(undefined, undefined)      // => '0'      (all undefined → fallback to '0')

// Zero is a valid value (not skipped)
values(0, 16)                     // => '0'

// String values
values(undefined, '50%', 16)      // => '50%'
values('auto')                    // => 'auto'

// No arguments
values()                          // => '0'

// Mixed types
values(undefined, null, 42)       // => '42px'
values(undefined, undefined, null, 42)  // => '42px'
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
    paddingLeft: values(props.paddingLeft, props.paddingX, props.padding),
    paddingRight: values(props.paddingX, props.padding),
    paddingTop: values(props.padding),
    paddingBottom: values(props.padding),
  }
}

resolveBoxStyles({ padding: 16 })
// { paddingLeft: '16px', paddingRight: '16px', paddingTop: '16px', paddingBottom: '16px' }

resolveBoxStyles({ padding: 16, paddingX: 32 })
// { paddingLeft: '32px', paddingRight: '32px', paddingTop: '16px', paddingBottom: '16px' }

resolveBoxStyles({ padding: 16, paddingX: 32, paddingLeft: 0 })
// { paddingLeft: '0', paddingRight: '32px', paddingTop: '16px', paddingBottom: '16px' }
```

## Custom Breakpoint Configuration

### Defining Custom Breakpoints

You can use any breakpoint names and pixel values. All functions accept a `BreakpointMap`:

```ts
import type { BreakpointMap } from '@pyreon/unistyle'
import {
  sortBreakpoints,
  getBreakpoint,
  createMediaQueries,
  normalizeResponsive,
  makeResponsive,
} from '@pyreon/unistyle'

const appBreakpoints: BreakpointMap = {
  phone: 0,
  tablet: 600,
  laptop: 1024,
  desktop: 1440,
  ultrawide: 1920,
}

// All functions work with custom breakpoints
const sorted = sortBreakpoints(appBreakpoints)
const bp = getBreakpoint(800, appBreakpoints)    // => 'tablet'
const queries = createMediaQueries(appBreakpoints)

const css = makeResponsive({
  fontSize: { phone: 14, tablet: 16, desktop: 18 },
  padding: { phone: 8, laptop: 16, desktop: 24 },
}, appBreakpoints)
```

### Minimal Breakpoint Set

For simpler applications, a two-breakpoint setup works well:

```ts
const simpleBreakpoints: BreakpointMap = {
  mobile: 0,
  desktop: 768,
}

const css = makeResponsive({
  fontSize: { mobile: 14, desktop: 16 },
  display: { mobile: 'block', desktop: 'flex' },
}, simpleBreakpoints)
// "font-size: 14px; display: block;
//  @media (min-width: 48em) { font-size: 16px; display: flex; }"
```

### Content-Based Breakpoints

Breakpoints do not have to align with device sizes. Content-based breakpoints work just as well:

```ts
const contentBreakpoints: BreakpointMap = {
  narrow: 0,
  readable: 540,    // Optimal line length for body text
  wide: 900,        // Room for sidebar
  spacious: 1200,   // Multi-column layouts
}
```

## Integration with Styler

`@pyreon/unistyle` provides the foundation that `@pyreon/styler` builds on. When using Styler, responsive values and breakpoints are passed through automatically:

```ts
import { styled } from '@pyreon/styler'
import { defaultBreakpoints } from '@pyreon/unistyle'

// Styler uses unistyle's responsive utilities internally
const Box = styled('div', {
  padding: { xs: 8, md: 16, xl: 24 },
  fontSize: { xs: 14, md: 16 },
  color: 'inherit',
})
```

Under the hood, Styler calls `makeResponsive` with your theme's breakpoints to generate the CSS rules.

## Real-World Responsive Layout Patterns

### Responsive Navigation

```ts
import { makeResponsive, defaultBreakpoints, createMediaQueries } from '@pyreon/unistyle'

const mq = createMediaQueries(defaultBreakpoints)

const navStyles = makeResponsive({
  display: 'flex',
  flexDirection: { xs: 'column', md: 'row' },
  alignItems: { xs: 'stretch', md: 'center' },
  gap: { xs: 4, md: 16 },
  padding: { xs: 8, md: 16, xl: 24 },
}, defaultBreakpoints)
```

### Responsive Typography Scale

```ts
import { makeResponsive, defaultBreakpoints } from '@pyreon/unistyle'

function createTypographyScale() {
  return {
    h1: makeResponsive({
      fontSize: { xs: 28, md: 36, xl: 48 },
      lineHeight: { xs: 1.2, md: 1.15 },
      letterSpacing: { xs: '-0.02em', xl: '-0.03em' },
    }, defaultBreakpoints),

    h2: makeResponsive({
      fontSize: { xs: 22, md: 28, xl: 36 },
      lineHeight: 1.25,
    }, defaultBreakpoints),

    body: makeResponsive({
      fontSize: { xs: 14, md: 16 },
      lineHeight: 1.6,
    }, defaultBreakpoints),

    caption: makeResponsive({
      fontSize: { xs: 12, md: 13 },
      lineHeight: 1.4,
    }, defaultBreakpoints),
  }
}
```

### Responsive Spacing System

```ts
import { value } from '@pyreon/unistyle'
import type { ResponsiveValue } from '@pyreon/unistyle'

// Define a spacing scale
const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const

type SpacingKey = keyof typeof spacing

// Convert spacing tokens to CSS values
function space(key: SpacingKey): string {
  return value(spacing[key])
}

space(0)   // => '0'
space(1)   // => '4px'
space(4)   // => '16px'
space(16)  // => '64px'
```

### Responsive Container

```ts
import {
  makeResponsive,
  normalizeResponsive,
  defaultBreakpoints,
  createMediaQueries,
} from '@pyreon/unistyle'

function containerStyles(maxWidth: ResponsiveValue<number | string> = {
  xs: '100%',
  sm: 540,
  md: 720,
  lg: 960,
  xl: 1140,
  xxl: 1320,
}) {
  return makeResponsive({
    width: '100%',
    marginLeft: 'auto',
    marginRight: 'auto',
    paddingLeft: { xs: 16, md: 24 },
    paddingRight: { xs: 16, md: 24 },
    maxWidth: maxWidth,
  }, defaultBreakpoints)
}
```

## TypeScript Utility Types

### `BreakpointMap`

```ts
type BreakpointMap = Record<string, number>
```

A record mapping breakpoint names (strings) to minimum pixel widths (numbers). The keys can be any string; they do not need to match the default breakpoint names.

### `BreakpointKey`

```ts
type BreakpointKey = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl'
```

Union of the default breakpoint names. Derived from `keyof typeof defaultBreakpoints`. Use this when you want to type-check against the default set.

### `MediaQueryMap`

```ts
type MediaQueryMap = Record<string, string>
```

A record mapping breakpoint names to their generated CSS media query strings. The smallest breakpoint maps to an empty string.

### `ResponsiveValue<T>`

```ts
type ResponsiveValue<T> = T | Partial<Record<string, T>>
```

A value that can be either a scalar `T` (applied to all breakpoints) or a partial record mapping breakpoint names to values of type `T`. This is the core type that enables responsive prop APIs.

**Type narrowing:**

```ts
function isResponsiveObject<T>(
  value: ResponsiveValue<T>
): value is Partial<Record<string, T>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
```

### Creating Type-Safe Responsive Props

```ts
import type { ResponsiveValue, BreakpointKey } from '@pyreon/unistyle'

// Constrain responsive values to default breakpoint keys
type StrictResponsiveValue<T> = T | Partial<Record<BreakpointKey, T>>

interface TypographyProps {
  fontSize?: StrictResponsiveValue<number>
  lineHeight?: StrictResponsiveValue<number | string>
  fontWeight?: StrictResponsiveValue<number>
  textAlign?: StrictResponsiveValue<'left' | 'center' | 'right' | 'justify'>
}

// This catches typos in breakpoint names at compile time:
const props: TypographyProps = {
  fontSize: { xs: 14, md: 16 },   // OK
  // fontSize: { mobile: 14 },     // Type error! 'mobile' is not in BreakpointKey
}
```

### Type-Safe Custom Breakpoints

```ts
import type { BreakpointMap } from '@pyreon/unistyle'

// Define your custom breakpoints as a const
const myBreakpoints = {
  phone: 0,
  tablet: 600,
  desktop: 1024,
} as const satisfies BreakpointMap

type MyBreakpointKey = keyof typeof myBreakpoints
// 'phone' | 'tablet' | 'desktop'

type MyResponsiveValue<T> = T | Partial<Record<MyBreakpointKey, T>>

// Now you get autocomplete and type checking for your custom breakpoints
const padding: MyResponsiveValue<number> = { phone: 8, tablet: 16, desktop: 24 }
```

## API Reference

| Export | Type | Description |
|---|---|---|
| `defaultBreakpoints` | `BreakpointMap` | Default breakpoint map: xs=0, sm=576, md=768, lg=992, xl=1200, xxl=1400 |
| `sortBreakpoints(bps)` | `(bps: BreakpointMap) => [string, number][]` | Sort breakpoints ascending by pixel value, returns tuples |
| `getBreakpoint(width, bps?)` | `(width: number, bps?: BreakpointMap) => string` | Get the active breakpoint name for a given viewport width |
| `createMediaQueries(bps, rootSize?)` | `(bps: BreakpointMap, rootSize?: number) => MediaQueryMap` | Generate mobile-first `@media (min-width)` query strings in em units |
| `createBetweenQuery(minPx, maxPx, rootSize?)` | `(minPx: number, maxPx: number, rootSize?: number) => string` | Create a min/max range media query with 0.02px gap |
| `normalizeResponsive(value, bps)` | `<T>(value: ResponsiveValue<T>, bps: BreakpointMap) => Record<string, T>` | Expand a responsive value into a full breakpoint map with cascading |
| `makeResponsive(theme, bps, rootSize?)` | `(theme: Record<string, ResponsiveValue<string \| number>>, bps: BreakpointMap, rootSize?: number) => string` | Convert responsive CSS properties to media-query-wrapped CSS string |
| `stripUnit(value)` | `(value: string) => number` | Parse numeric value from a CSS string, or `[number, string]` with `returnUnit` |
| `value(val, rootSize?)` | `(val: number \| string, rootSize?: number) => string` | Convert a number to CSS value (px for numbers greater than 1, rem for fractional, passthrough for strings) |
| `values(...vals)` | `(...vals: (number \| string \| undefined \| null)[]) => string` | Pick first defined value and convert it via `value()` |

## Types Reference

| Type | Definition | Description |
|---|---|---|
| `BreakpointMap` | `Record<string, number>` | Map of breakpoint names to pixel values |
| `BreakpointKey` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl' \| 'xxl'` | Union of default breakpoint names |
| `MediaQueryMap` | `Record<string, string>` | Map of breakpoint names to media query strings |
| `ResponsiveValue<T>` | `T \| Partial<Record<string, T>>` | Scalar or per-breakpoint value |
