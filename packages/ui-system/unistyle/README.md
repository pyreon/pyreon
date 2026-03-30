# @pyreon/unistyle

Responsive CSS engine for Pyreon.

Transforms property-centric theme objects into breakpoint-centric CSS with media queries. Automatic px-to-rem conversion, flex alignment helpers, and a data-driven style processor. Powers the responsive system behind `@pyreon/elements`, `@pyreon/coolgrid`, and `@pyreon/rocketstyle`.

## Features

- **Responsive pipeline** — write theme objects, get media queries automatically
- **px-to-rem conversion** — configurable rootSize, zero-effort unit handling
- **Breakpoint deduplication** — identical breakpoints are collapsed, no redundant CSS
- **Three input formats** — scalar, mobile-first array, or breakpoint object per property
- **Data-driven styles** — 100+ CSS properties processed from a theme object
- **Alignment helpers** — flex alignment constants for X and Y axes

## Installation

```bash
bun add @pyreon/unistyle
```

## Quick Start

```ts
import { Provider } from '@pyreon/unistyle'

const theme = {
  rootSize: 16,
  breakpoints: { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200 },
}

Provider({
  theme,
  children: [
    /* your app */
  ],
})
```

## API

### makeItResponsive

The core responsive engine. Takes a theme object and a styles processor, returns CSS with media query wrappers for each breakpoint.

```ts
import { makeItResponsive, styles } from '@pyreon/unistyle'
import { config } from '@pyreon/ui-core'

const { styled, css } = config

const Box = styled('div')`
  ${makeItResponsive({
    key: '$box',
    css,
    styles,
  })}
`

// Single values
Box({ $box: { padding: 16, fontSize: 14 } })

// Responsive breakpoint object
Box({ $box: { padding: { xs: 8, md: 16, lg: 24 }, fontSize: 14 } })

// Responsive mobile-first array
Box({ $box: { padding: [8, 16, 24], fontSize: 14 } })
```

**Pipeline:**

```text
theme object → normalize (fill gaps) → transform (property → breakpoint pivot)
  → optimize (deduplicate) → media queries
```

**Parameters:**

| Param     | Type       | Description                                                          |
| --------- | ---------- | -------------------------------------------------------------------- |
| key       | `string`   | Theme prop name to read from styled-component props                  |
| css       | `function` | `css` tagged template function                                       |
| styles    | `function` | Style processor (use the exported `styles`)                          |
| normalize | `boolean`  | Fill missing breakpoints by inheriting from previous (default: true) |

### styles

Data-driven CSS property processor. Reads a theme object and outputs CSS for all recognized properties — layout, spacing, typography, borders, backgrounds, transforms, and more.

Used internally by `makeItResponsive` but can be called directly:

```ts
import { styles } from '@pyreon/unistyle'

// styles({ theme, css, rootSize }) => css``
```

Supports shorthand properties (`margin`, `padding`, `borderRadius`) with automatic expansion, and converts numeric values to rem units.

### Unit Conversion

```ts
import { value, values, stripUnit } from '@pyreon/unistyle'

// value(input, rootSize?, outputUnit?) => string | number | null
value(16) // => '1rem'     (16 / 16)
value(24) // => '1.5rem'   (24 / 16)
value(0) // => '0'        (always unitless)
value('2em') // => '2em'      (string passthrough)
value(16, 16, 'px') // => '16px'

// stripUnit(input, unitReturn?)
stripUnit('24px') // => 24
stripUnit('24px', true) // => [24, 'px']
stripUnit(24) // => 24

// values(array, rootSize?, outputUnit?) => string
// Picks first non-null and converts
values([null, 16, 24], 16) // => '1rem'
```

### Alignment Helpers

```ts
import { alignContent, ALIGN_CONTENT_MAP_X, ALIGN_CONTENT_MAP_Y } from '@pyreon/unistyle'
```

Maps alignment keywords to CSS flex values:

| Keyword            | X-axis CSS      | Y-axis CSS      |
| ------------------ | --------------- | --------------- |
| `left` / `top`     | `flex-start`    | `flex-start`    |
| `center`           | `center`        | `center`        |
| `right` / `bottom` | `flex-end`      | `flex-end`      |
| `spaceBetween`     | `space-between` | `space-between` |
| `spaceAround`      | `space-around`  | `space-around`  |
| `block`            | `stretch`       | `stretch`       |

### Default Breakpoints

```ts
import { breakpoints } from '@pyreon/unistyle'
```

```ts
{
  rootSize: 16,
  breakpoints: {
    xs: 0,      // mobile
    sm: 576,    // small
    md: 768,    // tablet
    lg: 992,    // desktop
    xl: 1200,   // large desktop
    xxl: 1440,  // extra large
  },
}
```

Breakpoint values are converted to `em` units in media queries for correct cross-browser behavior.

### Other Exports

| Export                 | Description                                                        |
| ---------------------- | ------------------------------------------------------------------ |
| `createMediaQueries`   | Builds breakpoint-name → tagged-template-function map              |
| `transformTheme`       | Pivots property-centric theme to breakpoint-centric                |
| `normalizeTheme`       | Fills gaps so every breakpoint has a complete set of values        |
| `sortBreakpoints`      | Sorts breakpoint definitions by value (ascending)                  |
| `extendCss`            | Helper for processing ExtendCss props (string, function, callback) |
| `Provider` / `context` | Theme context provider and consumer                                |

## Responsive Value Formats

Every property in the theme object supports three formats:

```ts
// 1. Scalar — applied to all breakpoints
{ padding: 16 }

// 2. Array — mobile-first, values map to breakpoints by position
{ padding: [8, 12, 16] }  // xs: 8, sm: 12, md: 16

// 3. Object — explicit breakpoint keys
{ padding: { xs: 8, md: 16, xl: 24 } }
```

When using `normalize: true` (default), missing breakpoints inherit from the previous one.

## Peer Dependencies

| Package            | Version  |
| ------------------ | -------- |
| @pyreon/core       | >= 0.0.1 |
| @pyreon/reactivity | >= 0.0.1 |
| @pyreon/ui-core    | >= 0.0.1 |

## License

MIT
