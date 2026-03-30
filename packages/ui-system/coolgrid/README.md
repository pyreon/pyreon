# @pyreon/coolgrid

Responsive grid system for Pyreon.

Bootstrap-inspired Container / Row / Col grid with context-cascading configuration. Define breakpoints, column count, gaps, and gutters at any level — children inherit automatically. Every value is responsive.

## Features

- **Familiar mental model** — Container, Row, Col just like Bootstrap
- **Context cascading** — set columns, gaps, and gutters at Container level, inherited by all Rows and Cols
- **Responsive values** — single value, mobile-first array, or breakpoint object on every prop
- **Custom breakpoints** — name and size them however you want
- **Custom column counts** — 12, 24, 5 — any number
- **Custom components** — swap Container, Row, or Col underlying elements
- **Default Bootstrap theme** — included and ready to use

## Installation

```bash
bun add @pyreon/coolgrid
```

## Quick Start

```ts
import { Container, Row, Col, Provider, theme } from "@pyreon/coolgrid";

Provider({
  theme,
  children: Container({
    children: Row({
      children: [Col({ size: 8, children: "Main content" }), Col({ size: 4, children: "Sidebar" })],
    }),
  }),
});
```

## Components

### Container

Outermost grid boundary. Sets max-width and provides configuration context to descendants.

```ts
Container({
  columns: 12,
  gap: 16,
  gutter: 24,
  padding: 16,
  children: Row({ children: "..." }),
});
```

| Prop          | Type                | Description                                  |
| ------------- | ------------------- | -------------------------------------------- |
| columns       | `number`            | Number of grid columns (default: 12)         |
| gap           | `number`            | Space between columns                        |
| gutter        | `number`            | Outer gutter (negative margin offset on Row) |
| padding       | `number`            | Column inner padding                         |
| width         | `value \| function` | Override container max-width                 |
| component     | `ComponentFn`       | Custom root element                          |
| css           | `ExtendCss`         | Extend container styling                     |
| contentAlignX | `AlignX`            | Horizontal alignment of columns              |

All configuration props cascade to Row and Col through context.

### Row

Flex wrapper with column management. Inherits Container config and can override it.

```ts
Row({
  size: { xs: 12, md: 6 },
  contentAlignX: "center",
  children: [Col({ children: "Column 1" }), Col({ children: "Column 2" })],
});
```

Setting `size` on Row applies it to all Cols inside:

```ts
// All columns are 6 of 12
Row({
  size: 6,
  children: [Col({ children: "Half" }), Col({ children: "Half" })],
});
```

| Prop          | Type          | Description                             |
| ------------- | ------------- | --------------------------------------- |
| size          | `number`      | Default column size for all Cols inside |
| component     | `ComponentFn` | Custom row element                      |
| css           | `ExtendCss`   | Extend row styling                      |
| contentAlignX | `AlignX`      | Override horizontal alignment           |

### Col

Individual column. Width is calculated as a fraction of total columns.

```ts
// Fixed size
Col({ size: 4, children: "1/3 width" });

// Responsive size
Col({ size: { xs: 12, sm: 6, lg: 4 }, children: "Responsive" });

// Hidden on mobile
Col({ size: { xs: 0, md: 6 }, children: "Hidden on xs" });
```

| Prop      | Type          | Description                   |
| --------- | ------------- | ----------------------------- |
| size      | `number`      | Column span (e.g. 4 of 12)    |
| padding   | `number`      | Override column inner padding |
| component | `ComponentFn` | Custom column element         |
| css       | `ExtendCss`   | Extend column styling         |

## Configuration

### Custom Breakpoints

```ts
Provider({
  theme: {
    rootSize: 16,
    breakpoints: {
      phone: 0,
      tablet: 600,
      desktop: 1024,
      wide: 1440,
    },
  },
  children: [
    /* ... */
  ],
});
```

### Custom Column Count

```ts
Container({
  columns: 24,
  children: Row({
    children: [Col({ size: 16, children: "Two thirds" }), Col({ size: 8, children: "One third" })],
  }),
});
```

### Context Cascading

Configuration flows from Container through Row to Col via Pyreon's context system (`pushContext`/`popContext`):

```text
Container (columns: 12, gap: 16)
  └─ Row (inherits columns, gap)
       └─ Col (inherits columns, gap, calculates width)
```

Props set on a child override the inherited value for that level and below.

## Default Theme

The included `theme` export provides Bootstrap 4 defaults:

```ts
{
  rootSize: 16,
  breakpoints: { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200 },
  grid: {
    columns: 12,
    container: { xs: '100%', sm: 540, md: 720, lg: 960, xl: 1140 },
  },
}
```

## Responsive Values

All numeric props support three formats:

```ts
// Single value
Col({ size: 6 });

// Array (mobile-first, by breakpoint position)
Col({ size: [12, 6, 4] });

// Object (explicit breakpoints)
Col({ size: { xs: 12, md: 6, lg: 4 } });
```

## Peer Dependencies

| Package            | Version  |
| ------------------ | -------- |
| @pyreon/core       | >= 0.0.1 |
| @pyreon/reactivity | >= 0.0.1 |
| @pyreon/ui-core    | >= 0.0.1 |
| @pyreon/unistyle   | >= 0.0.1 |
| @pyreon/styler     | >= 0.0.1 |

## License

MIT
