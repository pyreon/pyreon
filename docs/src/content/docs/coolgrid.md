---
title: Coolgrid
description: Responsive 12-column grid system with Container, Row, and Col components.
---

`@pyreon/coolgrid` is a responsive, Bootstrap-style flexbox grid for Pyreon. It provides `Container`, `Row`, and `Col` components that work together through Pyreon's context system: you set the grid parameters once at the Container level, and every nested Row and Col inherits them. Every numeric prop is **responsive** — a single value, a mobile-first array, or a breakpoint-keyed object — and breakpoint names and column counts are **theme-driven**, not hardcoded.

<PackageBadge name="@pyreon/coolgrid" href="/docs/coolgrid" />

## Installation

:::code-group

```bash [npm]
npm install @pyreon/coolgrid
```

```bash [bun]
bun add @pyreon/coolgrid
```

```bash [pnpm]
pnpm add @pyreon/coolgrid
```

```bash [yarn]
yarn add @pyreon/coolgrid
```

:::

## Quick Start

```tsx
import { Provider, Container, Row, Col, theme } from '@pyreon/coolgrid'

;<Provider theme={theme}>
  <Container gap={16}>
    <Row>
      <Col size={{ xs: 12, md: 6, lg: 4 }}>Column 1</Col>
      <Col size={{ xs: 12, md: 6, lg: 4 }}>Column 2</Col>
      <Col size={{ xs: 12, md: 12, lg: 4 }}>Column 3</Col>
    </Row>
  </Container>
</Provider>
```

This creates a three-column layout that collapses to two columns at medium screens and one column on mobile.

The grid resolves its defaults (column count, container widths, breakpoints) from the theme context. In an app that already renders `<PyreonUI>` (from `@pyreon/ui-core`) at the root, skip `Provider` — PyreonUI sets up the same context. Use a standalone `Provider` only when coolgrid is used without the rest of the UI system, or to scope different breakpoints to a subtree.

<Example file="./examples/coolgrid/12-column-responsive-grid" title="12-column responsive grid" />

---

## How the Grid Works

### The 12-Column System

With the default theme, coolgrid uses a 12-column grid. Each column's `size` is expressed as a fraction of 12:

| `size` | Width  | Common Use                   |
| ------ | ------ | ---------------------------- |
| 1      | 8.33%  | Narrow gutter or icon column |
| 2      | 16.67% | Small sidebar                |
| 3      | 25%    | Quarter width                |
| 4      | 33.33% | One-third                    |
| 5      | 41.67% | --                           |
| 6      | 50%    | Half width                   |
| 7      | 58.33% | --                           |
| 8      | 66.67% | Two-thirds                   |
| 9      | 75%    | Three-quarters               |
| 10     | 83.33% | Wide content                 |
| 11     | 91.67% | Nearly full                  |
| 12     | 100%   | Full width                   |

You can customize the column count to any number (e.g., 24 for finer control) via the `columns` prop on Container or Row, or via `theme.grid.columns`.

### Responsive Values

Every numeric grid prop (`size`, `columns`, `gap`, `gutter`, `padding`) accepts three shapes:

```tsx
// Single value — applies at every breakpoint
<Col size={6}>Half</Col>

// Mobile-first array — positional [xs, sm, md, lg, xl]; values cascade UP
// (here lg and xl stay at the md value, 4)
<Col size={[12, 6, 4]}>Responsive</Col>

// Breakpoint-keyed object — explicit per breakpoint
<Col size={{ xs: 12, md: 6, lg: 4 }}>Responsive</Col>

// size 0 hides the column at that breakpoint
<Col size={{ xs: 0, md: 4 }}>Desktop-only</Col>
```

The breakpoint names come from the theme (`xs`--`xl` in the default theme); custom themes can define their own.

### Context Cascading

The grid uses Pyreon's context system to cascade configuration from parent to child:

1. **Container** resolves the grid config from its props and the theme, then provides it via context for descendants.
2. **Row** reads the Container's config from context, merges its own props over it, and re-provides the result for its Col children.
3. **Col** reads the Row's config from context to calculate its width and spacing.

The cascading keys are `columns`, `size`, `gap`, `padding`, `gutter`, `contentAlignX`, plus the extension points `colCss` / `colComponent` and `rowCss` / `rowComponent`. Props set at a deeper level override the ancestor **for that subtree only** — configure once at Container level, override per Row where needed.

### The Spacing Model

Coolgrid uses the classic negative-margin technique, driven by three cascading props:

- **`gap`** — space between columns. Each Col gets `margin: gap/2` (all sides); the Row compensates with a negative horizontal margin of `-gap/2` per side, so columns align flush with the container edges while keeping the full `gap` between neighbours.
- **`gutter`** — **vertical** spacing between rows. It feeds the Row's vertical margin: `gutter - gap/2` when `gutter` is set, else `gap/2`. It is *not* horizontal container padding — the Container itself only applies a responsive `max-width` and auto horizontal centering.
- **`padding`** — inner padding of each Col, halved per side (`padding={16}` renders `padding: 8px`).

```text
Container (max-width + auto horizontal margins — no padding of its own)
  Row (margin: {gutter - gap/2} {-gap/2})
    Col (margin: gap/2; padding: padding/2) | Col (...) | Col (...)
```

In classic (non-CSS-variables) mode, the Row's spacing block only renders when `gap` is a number — setting `gutter` without `gap` silently does nothing (use `gap={0}` if you only want gutter).

---

## Container

The outermost grid boundary. Renders a centered flex column (`width: 100%`, auto horizontal margins) with a responsive `max-width` resolved from the `width` prop, falling back to `theme.grid.container` (then `theme.coolgrid.container`). Provides the grid config to descendant Rows and Cols via context.

### Basic Usage

```tsx
import { Container } from '@pyreon/coolgrid'

;<Container columns={12} gap={16} gutter={24} padding={16}>
  {children}
</Container>
```

### Props

All numeric props accept the responsive shapes (single value / array / object).

| Prop            | Type                                                             | Default                     | Description                                                                                                          |
| --------------- | ---------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `columns`       | `number` (responsive)                                            | `theme.grid.columns` (12)   | Total grid columns. All nested Rows and Cols inherit this value unless overridden.                                    |
| `size`          | `number` (responsive)                                            | --                          | Default column span for every Col in the subtree (each Col can override).                                             |
| `gap`           | `number` (responsive)                                            | --                          | Space between columns. Halved into per-Col margins with a compensating negative horizontal margin on each Row.        |
| `gutter`        | `number` (responsive)                                            | --                          | Vertical spacing between rows. Feeds the Row margin math (`spacingY = gutter - gap/2`).                                |
| `padding`       | `number` (responsive)                                            | --                          | Inner padding of each Col, halved per side.                                                                            |
| `contentAlignX` | `'center' \| 'left' \| 'right' \| 'spaceAround' \| 'spaceBetween' \| 'spaceEvenly'` | -- | Default horizontal alignment of columns within every Row (maps to `justify-content`).                                  |
| `width`         | value \| responsive \| `(widths) => value`                       | `theme.grid.container`      | Container max-width. Also accepts a function receiving the theme-resolved container-width record.                      |
| `component`     | `ComponentFn` \| tag string                                      | --                          | Custom root element or component (e.g. `'main'`).                                                                      |
| `css`           | string \| `` (css) => css`...` `` (responsive)                    | --                          | Extra CSS merged into the container styles.                                                                            |
| `rowCss` / `rowComponent` | same as `css` / `component`                             | --                          | Defaults applied to every nested Row (each Row can override).                                                           |
| `colCss` / `colComponent` | same as `css` / `component`                             | --                          | Defaults applied to every nested Col (each Col can override).                                                           |
| `children`      | `VNodeChild`                                                      | --                          | Content, typically one or more Row components.                                                                          |

### Rendered Output

Container renders a flex column, centered via auto margins, with a responsive max-width:

```css
display: flex;
flex-direction: column;
box-sizing: border-box;
width: 100%;
margin-left: auto;
margin-right: auto;
max-width: {resolved width};  /* per breakpoint, from `width` prop or theme */
```

Note there is no horizontal padding on the Container itself — edge spacing comes from the Row/Col gap math or your own `css`.

### Examples

```tsx
// Theme-driven max-widths (Bootstrap-4 defaults: 100% / 540 / 720 / 960 / 1140)
<Container>{children}</Container>

// Explicit responsive max-width
<Container width={{ xs: '100%', lg: 1140 }}>{children}</Container>

// width as a function of the theme's resolved container widths
<Container width={(widths) => ({ ...widths, xl: 1320 })}>{children}</Container>

// Custom tag + extra CSS
<Container component="main" css="padding-top: 32px; padding-bottom: 32px;">
  {children}
</Container>
```

### Common mistakes

- **Expecting `gutter` to be horizontal container padding.** `gutter` feeds the Row's *vertical* margins (`spacingY = gutter - gap/2`); the Container itself only sets a responsive max-width plus auto horizontal centering.
- **Rendering without a theme context.** Grid defaults (`columns`, container widths) resolve from `theme.grid.*` / `theme.coolgrid.*`, so mount `<PyreonUI>` (or coolgrid's `Provider`) above the Container.
- **Setting a non-default `columns` on a Row instead of the Container.** It works for that Row only, but the visual cascade gets hard to reason about — keep `columns` at Container level.
- **Using CSS keyword values for `contentAlignX`** (`'space-between'`). The accepted keys are camelCase: `'spaceAround'` / `'spaceBetween'` (plus `'center'` / `'left'` / `'right'`).

---

## Row

A flex-wrap row. Reads the Container's config from context, merges its own props over it, and re-provides the result for Col children. Applies the negative-margin technique: horizontal margin `-gap/2` per side cancels the per-Col gap margins at the row edges; the vertical margin is `gutter - gap/2` when `gutter` is set, else `gap/2`.

### Basic Usage

```tsx
import { Row, Col } from '@pyreon/coolgrid'

<Row>
  <Col size={6}>Left</Col>
  <Col size={6}>Right</Col>
</Row>

// With alignment
<Row contentAlignX="center">
  <Col size={6}>Centered half-width content</Col>
</Row>
```

### Props

| Prop            | Type                                                             | Default                    | Description                                                                                      |
| --------------- | ---------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------ |
| `size`          | `number` (responsive)                                            | inherited                  | **Default span for every Col inside this Row** (each Col can still override with its own `size`). |
| `columns`       | `number` (responsive)                                            | inherited                  | Override the total column count for this Row's subtree only.                                       |
| `gap`           | `number` (responsive)                                            | inherited                  | Override the gap for this Row — drives its negative margins and its Cols' gap margins.             |
| `gutter`        | `number` (responsive)                                            | inherited                  | Vertical inter-row spacing (`spacingY = gutter - gap/2`).                                           |
| `padding`       | `number` (responsive)                                            | inherited                  | Default inner padding for Cols inside this Row.                                                     |
| `contentAlignX` | `'center' \| 'left' \| 'right' \| 'spaceAround' \| 'spaceBetween' \| 'spaceEvenly'` | inherited | Horizontal alignment of the columns (maps to `justify-content`).                                    |
| `component`     | `ComponentFn` \| tag string                                      | Container's `rowComponent` | Custom row element or component (e.g. `'section'`).                                                 |
| `css`           | string \| `` (css) => css`...` `` (responsive)                    | Container's `rowCss`       | Extra CSS for this Row.                                                                             |
| `children`      | `VNodeChild`                                                      | --                         | Content, typically one or more Col components.                                                      |

### Alignment

`contentAlignX` maps to `justify-content`:

| Value           | CSS             | Description                                |
| --------------- | --------------- | ------------------------------------------ |
| `'left'`        | `flex-start`    | Columns packed to the left                 |
| `'center'`      | `center`        | Columns centered                           |
| `'right'`       | `flex-end`      | Columns packed to the right                |
| `'spaceBetween'`| `space-between` | Equal space between columns, none at edges |
| `'spaceAround'` | `space-around`  | Equal space around each column             |
| `'spaceEvenly'` | `space-evenly`  | Equal space between and around each column |

There is no `alignY` prop. Columns stretch to the row's height by default (the flexbox `align-items: stretch` default) — see [Equal-Height Cards](#equal-height-cards).

### Rendered Output

```css
box-sizing: border-box;
display: flex;
flex-wrap: wrap;
align-self: stretch;
flex-direction: row;
margin: {gutter - gap/2 (or gap/2)} {-gap/2};  /* only when gap is a number */
justify-content: {contentAlignX};              /* only when contentAlignX is set */
```

`flex-wrap: wrap` makes columns wrap to the next line when the total span exceeds the column count.

### Overriding Container Config

Row can override any cascading prop. The overridden values cascade to its Cols:

```tsx
<Container columns={12} gap={24}>
  {/* This row uses the Container's defaults: 12 columns, 24px gap */}
  <Row>
    <Col size={6}>Half</Col>
    <Col size={6}>Half</Col>
  </Row>
  {/* This row overrides to 24 columns and 32px gap */}
  <Row columns={24} gap={32}>
    <Col size={6}>Quarter</Col> {/* 6/24 = 25% */}
    <Col size={12}>Half</Col> {/* 12/24 = 50% */}
    <Col size={6}>Quarter</Col> {/* 6/24 = 25% */}
  </Row>
  {/* size on a Row = default span for every Col inside */}
  <Row size={6}>
    <Col>Half</Col>
    <Col>Half</Col>
  </Row>
</Container>
```

### Common mistakes

- **Expecting `size` on a Row to size the Row itself.** It is the default `size` for every Col child (each Col can still override with its own `size`).
- **Setting `gutter` without `gap`.** In classic (non-cssVariables) mode the Row spacing block early-returns unless `gap` is a number, so the gutter silently does nothing — set `gap` too (`gap={0}` works).
- **Passing CSS keyword values to `contentAlignX`** (`'space-between'`). Keys are camelCase (`'spaceBetween'`); the map resolves them to the real `justify-content` values.

---

## Col

An individual column. Reads `columns`, `gap`, the default `size`, and `padding` from the Row context and computes its width as a fraction of the total columns. Without a `size` it becomes an **auto column** (`flex-grow: 1; flex-basis: 0`) that shares the leftover space.

Note that `gap`, `gutter`, and `columns` are deliberately **not** Col props — they resolve at Row/Container level so the Row's negative margins and the Col's width math always agree.

### Basic Usage

```tsx
import { Col } from '@pyreon/coolgrid'

<Col size={4}>1/3 width on every breakpoint</Col>
<Col size={{ xs: 12, sm: 6, lg: 4 }}>Responsive</Col>
<Col size={[12, 6, 4]}>Mobile-first array</Col>
<Col size={{ xs: 0, md: 6 }}>Hidden on xs</Col>
<Col>Auto column — shares leftover space</Col>
<Col component="article" css="text-align: center;">Custom element + extra CSS</Col>
```

### Props

| Prop        | Type                                          | Default                | Description                                                                                     |
| ----------- | --------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------ |
| `size`      | `number` (responsive)                         | Row's `size`, else auto | Column span as a fraction of the total columns. `0` hides the column; omitted = auto column.      |
| `padding`   | `number` (responsive)                         | inherited              | Inner padding override — halved per side (`padding={16}` renders `padding: 8px`).                 |
| `component` | `ComponentFn` \| tag string                   | cascade's `colComponent` | Custom column element or component.                                                              |
| `css`       | string \| `` (css) => css`...` `` (responsive) | cascade's `colCss`     | Extra CSS for this Col.                                                                            |
| `children`  | `VNodeChild`                                   | --                     | Column content.                                                                                    |

### Width Calculation

When both `size` and `columns` resolve to positive numbers, the column's width is:

```
calc(size / columns * 100% - gap px)   // when gap is set
(size / columns * 100%)                // without gap
```

applied as `flex-basis` and `max-width` with `flex-grow: 0; flex-shrink: 0`. In a 12-column grid:

| `size` | Width (no gap) | Fraction |
| ------ | -------------- | -------- |
| 1      | 8.33%          | 1/12     |
| 2      | 16.67%         | 1/6      |
| 3      | 25%            | 1/4      |
| 4      | 33.33%         | 1/3      |
| 6      | 50%            | 1/2      |
| 8      | 66.67%         | 2/3      |
| 9      | 75%            | 3/4      |
| 12     | 100%           | Full     |

With a custom column count (via Container, Row, or theme), the calculation adjusts accordingly: in a 24-column grid, `size={6}` gives 6/24 = 25%.

Setting `size` greater than the resolved `columns` produces a width over 100% and the column overflows its row.

### Auto Columns

A Col without a `size` (and with no `size` default on its Row/Container) keeps the base styles `flex-grow: 1; flex-basis: 0` — all auto columns in a row share the remaining space equally:

```tsx
<Row>
  <Col size={4}>Fixed third</Col>
  <Col>Auto</Col>
  <Col>Auto</Col>
</Row>
```

### Hiding Columns (`size: 0`)

`size: 0` hides the column at that breakpoint by moving it **off-screen** — `position: fixed; left: -9999px; margin: 0; padding: 0` — not `display: none`. The element stays mounted and its children stay alive:

```tsx
{/* Hidden on xs/sm, a third from md up */}
<Col size={{ xs: 0, md: 4 }}>Desktop-only card</Col>
```

### Common mistakes

- **Assuming `size: 0` unmounts or `display: none`s the column.** It moves the element off-screen (`position: fixed; left: -9999px`) — the element stays mounted and its children stay alive.
- **Reading a mobile-first array as per-breakpoint-exact.** `[xs, sm, md, lg, xl]` values CASCADE upward — `size={[12, 6, 4]}` leaves lg/xl at the md value (4); it does not reset them.
- **Expecting `padding={16}` to render 16px of padding.** Grid padding (like gap) is halved per side, so it renders `padding: 8px`.
- **Trying to set `gap` / `columns` / `gutter` on an individual Col.** Col's typed props deliberately omit them — set them on the Row or Container.

---

## Theme & Configuration

### The Default Theme

The package exports a default Bootstrap-4-style theme:

```ts
import { theme } from '@pyreon/coolgrid'

// {
//   rootSize: 16,
//   breakpoints: { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200 },
//   grid: {
//     columns: 12,
//     container: { xs: '100%', sm: 540, md: 720, lg: 960, xl: 1140 },
//   },
// }
```

| Breakpoint | Min Width | Container max-width |
| ---------- | --------- | ------------------- |
| `xs`       | 0px       | `100%`              |
| `sm`       | 576px     | `540px`             |
| `md`       | 768px     | `720px`             |
| `lg`       | 992px     | `960px`             |
| `xl`       | 1200px    | `1140px`            |

### Resolution Order

Grid columns and container widths resolve through a three-layer fallback:

1. Explicit component props (`columns={24}`, `width={...}`)
2. `theme.grid.columns` / `theme.grid.container`
3. `theme.coolgrid.columns` / `theme.coolgrid.container`

### Provider vs PyreonUI

`Provider` (re-exported from `@pyreon/unistyle`) enriches the theme with pre-computed breakpoints and media-query helpers and provides it to the subtree. It is **deprecated in source** — prefer `<PyreonUI theme={theme} mode="light">` from `@pyreon/ui-core`, which handles all the context layers (styler, core, mode) in one component:

```tsx
// Standalone (no PyreonUI at the root):
import { Provider, Container, theme } from '@pyreon/coolgrid'

<Provider theme={theme}>
  <Container>…</Container>
</Provider>

// Preferred in real apps:
import { PyreonUI } from '@pyreon/ui-core'

<PyreonUI theme={appTheme} mode="light">
  <Container>…</Container>
</PyreonUI>
```

The remaining legitimate use of a nested `Provider` is scoping *different* breakpoints or grid defaults to a subtree. Note that context is per-Provider — a nested `Provider` starts fresh from its own `theme`; it does not inherit the outer Provider's overrides.

### Custom Breakpoints and Column Counts

Ship your own theme with the same shape (`rootSize`, `breakpoints`, `grid.columns`, `grid.container`) for custom breakpoint names and column counts:

```tsx
<Provider
  theme={{
    rootSize: 16,
    breakpoints: { phone: 0, tablet: 600, desktop: 1024 },
    grid: { columns: 24, container: { phone: '100%', tablet: 540, desktop: 960 } },
  }}
>
  <Container>
    <Row>
      <Col size={16}>Two thirds of 24</Col>
      <Col size={8}>One third of 24</Col>
    </Row>
  </Container>
</Provider>
```

Two things to keep consistent in a custom theme: include `grid.container` (without it the Container has no max-width source and renders full-width at every breakpoint), and key it by the same breakpoint names as `breakpoints` — the responsive engine resolves widths per breakpoint name.

You can also override the column count per Container or per Row without touching the theme:

```tsx
// 24-column grid for finer control
<Container columns={24} gap={16}>
  <Row>
    <Col size={16}>Two-thirds</Col>
    <Col size={8}>One-third</Col>
  </Row>
</Container>

// 6-column grid for simple layouts
<Container columns={6} gap={24}>
  <Row>
    <Col size={2}>One</Col>
    <Col size={2}>Two</Col>
    <Col size={2}>Three</Col>
  </Row>
</Container>
```

### CSS-Variables Theming

Under `init({ cssVariables: true })`, `gap` / `gutter` / `padding` can arrive as `var(--…)` reference strings. The styled helpers detect them and express the grid math in native `calc()` (halving via `* 0.5` / `* -0.5`), so the negative-margin technique works unchanged — no JS arithmetic ever runs on a `var()` string.

---

## Layout Examples

### Basic Two-Column Layout

```tsx
<Container gap={24}>
  <Row>
    <Col size={{ xs: 12, md: 8 }}>Main content</Col>
    <Col size={{ xs: 12, md: 4 }}>Sidebar</Col>
  </Row>
</Container>
```

### Centered Narrow Content

```tsx
<Container>
  <Row contentAlignX="center">
    <Col size={{ xs: 12, md: 8, lg: 6 }}>Centered content</Col>
  </Row>
</Container>
```

### Card Grid

```tsx
import { For } from '@pyreon/core'

;<Container gap={16}>
  <Row>
    <For each={items} by={(item) => item.id}>
      {(item) => (
        <Col size={{ xs: 12, sm: 6, lg: 4, xl: 3 }}>
          <div class="card">{item.title}</div>
        </Col>
      )}
    </For>
  </Row>
</Container>
```

### Header + Sidebar + Content + Footer

```tsx
function PageLayout(props: {
  header: VNodeChild
  sidebar: VNodeChild
  content: VNodeChild
  footer: VNodeChild
}) {
  return (
    <Container gap={24} gutter={24}>
      {/* Header -- full width */}
      <Row>
        <Col size={12}>
          <header class="site-header">{props.header}</header>
        </Col>
      </Row>
      {/* Main area -- sidebar + content */}
      <Row>
        <Col size={{ xs: 12, md: 3 }}>
          <aside class="sidebar">{props.sidebar}</aside>
        </Col>
        <Col size={{ xs: 12, md: 9 }}>
          <main class="main-content">{props.content}</main>
        </Col>
      </Row>
      {/* Footer -- full width */}
      <Row>
        <Col size={12}>
          <footer class="site-footer">{props.footer}</footer>
        </Col>
      </Row>
    </Container>
  )
}
```

### Nested Grids

Grids can be nested — a Col can contain its own Row and Col children. The inner Row reads the nearest cascade from context and can override `gap` and `columns` independently:

```tsx
<Container gap={24}>
  <Row>
    {/* Main content area */}
    <Col size={{ xs: 12, md: 8 }}>
      <h1>Product Gallery</h1>
      {/* Nested grid within the main column */}
      <Row gap={16}>
        <Col size={6}>
          <img src="/product-1.jpg" style="width: 100%;" />
        </Col>
        <Col size={6}>
          <img src="/product-2.jpg" style="width: 100%;" />
        </Col>
        <Col size={6}>
          <img src="/product-3.jpg" style="width: 100%;" />
        </Col>
        <Col size={6}>
          <img src="/product-4.jpg" style="width: 100%;" />
        </Col>
      </Row>
    </Col>
    {/* Sidebar */}
    <Col size={{ xs: 12, md: 4 }}>
      <div class="product-details">
        <h2>Product Name</h2>
        <p>Product description...</p>
      </div>
    </Col>
  </Row>
</Container>
```

### Equal-Height Cards

Columns stretch to the row's height by default (flexbox's `align-items: stretch`), and each Col is itself a flex column — so equal-height cards need only `height: 100%` on the card element:

```tsx
<Container gap={24}>
  <Row>
    <Col size={{ xs: 12, md: 4 }}>
      <div class="card" style="height: 100%;">Short content.</div>
    </Col>
    <Col size={{ xs: 12, md: 4 }}>
      <div class="card" style="height: 100%;">
        Much more content that makes this card taller. The other cards stretch to match.
      </div>
    </Col>
    <Col size={{ xs: 12, md: 4 }}>
      <div class="card" style="height: 100%;">Medium amount of content.</div>
    </Col>
  </Row>
</Container>
```

---

## Comparison with CSS Approaches

### vs. CSS Grid

CSS Grid (`display: grid`) is a two-dimensional layout system. Coolgrid uses flexbox internally, which is one-dimensional (row-based). Key differences:

- **Coolgrid** works through Pyreon's context system with automatic configuration inheritance
- **CSS Grid** gives you explicit row and column placement in CSS
- **Coolgrid** handles the gap math automatically (per-Col margins + Row negative margins)
- **CSS Grid** uses native `gap` without the negative-margin technique

Use Coolgrid when you want a component-based grid with automatic configuration cascading. Use CSS Grid directly when you need precise two-dimensional placement.

### vs. Raw Flexbox

Coolgrid is built on flexbox but handles the common boilerplate:

- Percentage width calculation (`calc(size / columns * 100% - gap)`)
- Gap math with negative margins
- Alignment mapping from friendly names to CSS values
- Responsive values (arrays / breakpoint objects) compiled to mobile-first media queries
- Configuration inheritance through context

You could achieve the same layouts with raw flexbox styles, but Coolgrid encapsulates the patterns into reusable components.

---

## Standalone Row + Col

Row and Col work without a Container — they still need a theme context (`Provider` or `PyreonUI`) to resolve defaults like the column count, but the Container's centering and max-width are simply absent:

```tsx
// Standalone Row with explicit config
<Row columns={6} gap={12}>
  <Col size={2}>One-third</Col>
  <Col size={2}>One-third</Col>
  <Col size={2}>One-third</Col>
</Row>
```

The Cols read the Row's config from context; width calculations work the same.

---

## API Reference

| Export      | Type      | Description                                                                                                                        |
| ----------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `Container` | Component | Outermost grid boundary — centered flex column with responsive max-width. Provides the grid config via context.                      |
| `Row`       | Component | Flex-wrap row. Reads the Container cascade, merges its own props, re-provides for Cols. Applies the negative-margin gap technique.   |
| `Col`       | Component | Grid column with responsive `size` and `padding`. Reads the Row cascade for columns/gap; auto column without a `size`; `0` hides it.  |
| `Provider`  | Component | Theme provider (re-export of `@pyreon/unistyle`'s). Deprecated — prefer `PyreonUI` from `@pyreon/ui-core`.                            |
| `theme`     | Object    | Default Bootstrap-4-style theme: `rootSize: 16`, breakpoints xs--xl, 12 columns, responsive container widths.                          |

## Prop Value Shapes

These shapes describe what the props accept (the type aliases themselves are internal — they are not exported from the package entry):

| Shape            | Accepted by                                     | Description                                                                                                          |
| ---------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| responsive number | `size`, `columns`, `gap`, `gutter`, `padding`  | `number`, mobile-first `number[]`, or a breakpoint-keyed object (e.g. `&#123; xs: 12, md: 6 &#125;`).                  |
| container width   | `width` on Container                           | Value (`number` \| `string`), responsive array/object of values, or a function of the theme-resolved width record.     |
| alignment         | `contentAlignX`                                | `'center' \| 'left' \| 'right' \| 'spaceAround' \| 'spaceBetween' \| 'spaceEvenly'` (camelCase keys, not CSS keywords). |
| extra CSS         | `css`, `rowCss`, `colCss`                      | CSS string or `` (css) => css`...` `` function — responsive-capable (array / breakpoint object of either).              |
| component         | `component`, `rowComponent`, `colComponent`    | A tag string (`'main'`, `'section'`, `'article'`) or any Pyreon component.                                              |
