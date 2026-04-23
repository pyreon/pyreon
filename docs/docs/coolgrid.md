---
title: Coolgrid
description: Responsive 12-column grid system with Container, Row, and Col components.
---

`@pyreon/coolgrid` is a responsive grid layout system for Pyreon. It provides `Container`, `Row`, and `Col` components that work together through Pyreon's context system to create flexible grid layouts. Configuration cascades automatically from Container to Row to Col -- you set the grid parameters once at the Container level, and everything inherits.

<PackageBadge name="@pyreon/coolgrid" href="/docs/coolgrid" />

## Installation

::: code-group

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
import { Container, Row, Col } from '@pyreon/coolgrid'

;<Container maxWidth={1140} gap={24} gutter={16}>
  <Row>
    <Col xs={12} md={6} lg={4}>
      Column 1
    </Col>
    <Col xs={12} md={6} lg={4}>
      Column 2
    </Col>
    <Col xs={12} md={12} lg={4}>
      Column 3
    </Col>
  </Row>
</Container>
```

This creates a three-column layout that stacks to two columns at medium screens and one column on mobile.

<Playground title="12-Column Responsive Grid" :height="200">
const cols = signal([4, 4, 4])

const presets = {
  'Thirds': [4, 4, 4],
  'Halves': [6, 6],
  'Sidebar': [3, 9],
  'Header': [12],
  'Quarters': [3, 3, 3, 3],
}

const app = document.getElementById('app')
const ui = h('div', {},
  h('div', { style: { marginBottom: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap' } },
    ...Object.keys(presets).map(name =>
      h('button', {
        onClick: () => cols.set(presets[name]),
        style: { padding: '4px 10px', border: '1px solid #ccc', borderRadius: '4px', background: '#fff', cursor: 'pointer', fontSize: '13px' },
      }, name),
    ),
  ),
  h('div', { style: { display: 'flex', gap: '8px', padding: '8px', background: '#f5f5f5', borderRadius: '6px' } },
    () => cols().map(span =>
      h('div', { style: { flex: span, padding: '16px 8px', background: '#2196f3', color: 'white', borderRadius: '4px', textAlign: 'center', fontSize: '13px' } }, `col ${span}/12`),
    ),
  ),
)
mount(ui, app)
</Playground>

---

## How the Grid Works

### The 12-Column System

Coolgrid uses a 12-column grid by default. Each column's width is expressed as a fraction of 12. This gives you a flexible set of layout widths:

| Columns | Width  | Common Use                   |
| ------- | ------ | ---------------------------- |
| 1       | 8.33%  | Narrow gutter or icon column |
| 2       | 16.67% | Small sidebar                |
| 3       | 25%    | Quarter width                |
| 4       | 33.33% | One-third                    |
| 5       | 41.67% | --                           |
| 6       | 50%    | Half width                   |
| 7       | 58.33% | --                           |
| 8       | 66.67% | Two-thirds                   |
| 9       | 75%    | Three-quarters               |
| 10      | 83.33% | Wide content                 |
| 11      | 91.67% | Nearly full                  |
| 12      | 100%   | Full width                   |

You can customize the column count to any number (e.g., 24 columns for finer control) by passing a `columns` prop to Container or Row.

### Context Cascading

The grid uses Pyreon's context system to cascade configuration from parent to child:

1. **Container** sets the grid config (columns, gap, gutter, padding) and provides it via context using `provide()`.
2. **Row** reads the Container's config from context via `useContext`. It can override `columns` and `gap`. Row then provides its own config into context for child columns.
3. **Col** reads the Row's config from context to calculate its width percentage and internal padding.

This means you configure the grid once at the Container level, and Rows and Cols automatically inherit those settings. If you need a Row with different settings, you can override them at the Row level.

### The Gutter Technique

Coolgrid uses the classic negative-margin gutter technique:

1. **Container** adds horizontal padding (`gutter`) to prevent content from touching the edges.
2. **Row** applies negative horizontal margins of `-gap/2` on each side to offset column padding.
3. **Col** applies horizontal padding of `gap/2` on each side to create the visual gap between columns.

This approach ensures columns align perfectly with the container edges while maintaining consistent spacing between columns.

```
Container (padding: gutter)
  Row (margin: -gap/2)
    Col (padding: gap/2) | Col (padding: gap/2) | Col (padding: gap/2)
```

---

## Container

The outermost grid wrapper. Centers content horizontally with auto margins, constrains width, and applies horizontal gutters.

### Basic Usage

```tsx
import { Container } from '@pyreon/coolgrid'

;<Container maxWidth={1140} columns={12} gap={24} gutter={16}>
  {children}
</Container>
```

### Props

| Prop       | Type               | Default  | Description                                                                                                                                           |
| ---------- | ------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxWidth` | `string \| number` | `'100%'` | Maximum width of the container. Numbers are converted to pixels (e.g., `1140` becomes `'1140px'`). Strings are used as-is (e.g., `'80vw'`, `'100%'`). |
| `columns`  | `number`           | `12`     | Number of grid columns. All child Rows and Cols inherit this value unless overridden.                                                                 |
| `gap`      | `number`           | `0`      | Gap between columns in pixels. Creates visual spacing between columns using the padding/negative-margin technique.                                    |
| `gutter`   | `number`           | `0`      | Horizontal padding on the container in pixels. Prevents content from touching the viewport edges. Applied as `padding-left` and `padding-right`.      |
| `padding`  | `number`           | `0`      | Additional padding value passed through context. Available to child components but not directly applied to the Container's style.                     |
| `tag`      | `string`           | `'div'`  | HTML tag for the container element.                                                                                                                   |
| `class`    | `string`           | --       | CSS class name.                                                                                                                                       |
| `style`    | `string`           | --       | Additional inline styles appended to the computed styles.                                                                                             |
| `children` | `VNodeChild`       | --       | Content, typically one or more Row components.                                                                                                        |

### Rendered Output

Container renders as a block element with:

```css
max-width: {maxWidth};
margin-left: auto;
margin-right: auto;
box-sizing: border-box;
padding-left: {gutter}px;   /* only when gutter > 0 */
padding-right: {gutter}px;  /* only when gutter > 0 */
```

### Examples

```tsx
// Fixed-width centered container
<Container maxWidth={960}>{children}</Container>

// Full-width container with gutters
<Container maxWidth="100%" gutter={16}>{children}</Container>

// Container with custom tag and class
<Container
  tag="main"
  maxWidth={1200}
  gap={24}
  gutter={24}
  class="page-container"
>{children}</Container>

// Narrow content container
<Container
  maxWidth={640}
  gap={16}
  style="padding-top: 32px; padding-bottom: 32px;"
>{children}</Container>
```

---

## Row

A flex container for columns. Reads the parent Container's config for gap and column count, and provides its own config to child Col components.

### Basic Usage

```tsx
import { Row } from '@pyreon/coolgrid'

<Row>
  <Col xs={6}>Left</Col>
  <Col xs={6}>Right</Col>
</Row>

// With alignment
<Row alignX="center" alignY="center">
  <Col xs={6}>Centered horizontally</Col>
</Row>
```

### Props

| Prop       | Type                                                                 | Default                  | Description                                                                                                              |
| ---------- | -------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `gap`      | `number`                                                             | inherited from Container | Override the Container's gap for this row only. Affects the negative margins on this row and the padding on its columns. |
| `columns`  | `number`                                                             | inherited from Container | Override the column count for this row only. Affects width calculations for its columns.                                 |
| `alignX`   | `'left' \| 'center' \| 'right' \| 'between' \| 'around' \| 'evenly'` | --                       | Horizontal alignment of columns within the row. Maps to `justify-content`.                                               |
| `alignY`   | `'top' \| 'center' \| 'bottom' \| 'stretch'`                         | --                       | Vertical alignment of columns within the row. Maps to `align-items`.                                                     |
| `tag`      | `string`                                                             | `'div'`                  | HTML tag.                                                                                                                |
| `class`    | `string`                                                             | --                       | CSS class.                                                                                                               |
| `style`    | `string`                                                             | --                       | Additional inline styles.                                                                                                |
| `children` | `VNodeChild`                                                         | --                       | Content, typically one or more Col components.                                                                           |

### Alignment

The `alignX` prop maps to `justify-content`:

| Value       | CSS             | Description                                |
| ----------- | --------------- | ------------------------------------------ |
| `'left'`    | `flex-start`    | Columns packed to the left                 |
| `'center'`  | `center`        | Columns centered                           |
| `'right'`   | `flex-end`      | Columns packed to the right                |
| `'between'` | `space-between` | Equal space between columns, none at edges |
| `'around'`  | `space-around`  | Equal space around each column             |
| `'evenly'`  | `space-evenly`  | Equal space between and around columns     |

The `alignY` prop maps to `align-items`:

| Value       | CSS          | Description                            |
| ----------- | ------------ | -------------------------------------- |
| `'top'`     | `flex-start` | Columns aligned to the top             |
| `'center'`  | `center`     | Columns vertically centered            |
| `'bottom'`  | `flex-end`   | Columns aligned to the bottom          |
| `'stretch'` | `stretch`    | Columns stretch to fill the row height |

### Rendered Output

Row renders as a flex container with wrapping:

```css
display: flex;
flex-wrap: wrap;
box-sizing: border-box;
margin-left: -{gap/2}px;   /* only when gap > 0 */
margin-right: -{gap/2}px;  /* only when gap > 0 */
justify-content: {alignX};  /* only when alignX is set */
align-items: {alignY};      /* only when alignY is set */
```

The `flex-wrap: wrap` ensures columns wrap to the next line when the total span exceeds the column count.

### Overriding Container Config

Row can override the Container's `columns` and `gap` settings. The overridden values cascade to child Cols:

```tsx
<Container columns={12} gap={24}>
  {/* This row uses the Container's defaults: 12 columns, 24px gap */}
  <Row>
    <Col xs={6}>Half</Col>
    <Col xs={6}>Half</Col>
  </Row>
  {/* This row overrides to 24 columns and 32px gap */}
  <Row columns={24} gap={32}>
    <Col xs={6}>Quarter</Col> {/* 6/24 = 25% */}
    <Col xs={12}>Half</Col> {/* 12/24 = 50% */}
    <Col xs={6}>Quarter</Col> {/* 6/24 = 25% */}
  </Row>
</Container>
```

### Alignment Examples

```tsx
// Center a single narrow column
<Row alignX="center">
  <Col xs={6}>Centered half-width content</Col>
</Row>

// Right-align columns
<Row alignX="right">
  <Col xs={4}>Right-aligned content</Col>
</Row>

// Space columns evenly
<Row alignX="evenly">
  <Col xs={3}>A</Col>
  <Col xs={3}>B</Col>
  <Col xs={3}>C</Col>
</Row>

// Vertically center columns with different heights
<Row alignY="center">
  <Col xs={6}>
    <div style="height: 200px; background: #eee;">Tall</div>
  </Col>
  <Col xs={6}>
    <div style="height: 100px; background: #ddd;">Short</div>
  </Col>
</Row>

// Stretch columns to equal height
<Row alignY="stretch">
  <Col xs={6}>
    <div style="background: #eee; height: 100%;">Stretches</div>
  </Col>
  <Col xs={6}>
    <div style="background: #ddd; height: 100%;">Also stretches</div>
  </Col>
</Row>
```

---

## Col

A grid column that calculates its width as a percentage of the total column count. Reads the gap and column count from the parent Row's context.

### Basic Usage

```tsx
import { Col } from '@pyreon/coolgrid'

// Full width on mobile, half on medium, third on large
<Col xs={12} md={6} lg={4}>Content</Col>

// With offset
<Col xs={8} offset={2}>Centered content</Col>

// With order override
<Col xs={6} order={2}>Visually second</Col>
```

### Props

| Prop       | Type         | Default       | Description                                                                                                                                                                             |
| ---------- | ------------ | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `xs`       | `number`     | total columns | Column span at the base (smallest) breakpoint. This is the only span value used for inline style width calculation. If not provided, defaults to the total column count (100% width).   |
| `sm`       | `number`     | --            | Column span at the `sm` breakpoint. Accepted as a prop for use with responsive styling systems like Unistyle, but not used for inline style calculation.                                |
| `md`       | `number`     | --            | Column span at the `md` breakpoint. Same note as `sm`.                                                                                                                                  |
| `lg`       | `number`     | --            | Column span at the `lg` breakpoint. Same note as `sm`.                                                                                                                                  |
| `xl`       | `number`     | --            | Column span at the `xl` breakpoint. Same note as `sm`.                                                                                                                                  |
| `offset`   | `number`     | --            | Column offset. Adds `margin-left` as a percentage of the total columns. For example, `offset: 3` in a 12-column grid adds `margin-left: 25%`. An offset of `0` is treated as no offset. |
| `order`    | `number`     | --            | CSS `order` property for visual reordering. Lower values appear first. Can be negative.                                                                                                 |
| `tag`      | `string`     | `'div'`       | HTML tag.                                                                                                                                                                               |
| `class`    | `string`     | --            | CSS class.                                                                                                                                                                              |
| `style`    | `string`     | --            | Additional inline styles appended to the computed styles.                                                                                                                               |
| `children` | `VNodeChild` | --            | Column content.                                                                                                                                                                         |

### Width Calculation

Column width is computed as `(span / columns) * 100%`. In a 12-column grid:

| `xs` | Width  | Fraction |
| ---- | ------ | -------- |
| 1    | 8.33%  | 1/12     |
| 2    | 16.67% | 1/6      |
| 3    | 25%    | 1/4      |
| 4    | 33.33% | 1/3      |
| 6    | 50%    | 1/2      |
| 8    | 66.67% | 2/3      |
| 9    | 75%    | 3/4      |
| 12   | 100%   | Full     |

If no `xs` prop is provided, the column defaults to the full column count (100% width).

When a custom column count is used (via Container or Row), the calculation adjusts accordingly. For example, in a 24-column grid, `xs: 6` gives `6/24 = 25%`.

### Rendered Output

Col renders with the following computed styles:

```css
box-sizing: border-box;
flex: 0 0 {widthPercent}%;
max-width: {widthPercent}%;
padding-left: {gap/2}px;    /* only when gap > 0 */
padding-right: {gap/2}px;   /* only when gap > 0 */
margin-left: {offsetPercent}%;  /* only when offset > 0 */
order: {order};              /* only when order is set */
```

### Offset

The `offset` prop pushes a column to the right by adding `margin-left` as a percentage:

```tsx
// Center an 8-column block in a 12-column grid
// offset 2 = 2/12 = 16.67% margin-left
<Row>
  <Col xs={8} offset={2}>Centered</Col>
</Row>

// Skip the first third
<Row>
  <Col xs={8} offset={4}>After the first third</Col>
</Row>
```

Be careful: offset plus span should not exceed the total columns, or the column will wrap to the next line.

### Order

The `order` prop controls visual ordering without changing the DOM order. This is useful for reordering columns at different breakpoints or for accessibility reasons (keeping DOM order logical while adjusting visual order):

```tsx
<Row>
  {/* DOM order: sidebar first, content second */}
  {/* Visual order: content first (order 1), sidebar second (order 2) */}
  <Col xs={12} md={4} order={2}>
    Sidebar
  </Col>
  <Col xs={12} md={8} order={1}>
    Main Content
  </Col>
</Row>
```

Negative order values are supported:

```tsx
<Row>
  <Col xs={6} order={0}>
    Second
  </Col>
  <Col xs={6} order={-1}>
    First (negative order)
  </Col>
</Row>
```

### Standalone Col (Without Row Context)

Col can be used without a Row context. When no context is available, it defaults to 12 columns and 0 gap:

```tsx
// Works fine without Row -- defaults to 12 columns, no gap
<Col xs={6}>Half width</Col>
```

---

## Grid Configuration

### Default Values

The package exports default configuration values for reference and reuse:

```ts
import { defaultGridConfig, defaultBreakpoints, defaultContainerWidths } from '@pyreon/coolgrid'

defaultGridConfig
// { columns: 12, containerWidth: '100%', gap: 0, gutter: 0, padding: 0 }

defaultBreakpoints
// { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200 }

defaultContainerWidths
// { xs: '100%', sm: 540, md: 720, lg: 960, xl: 1140 }
```

### GridConfig Type

The configuration object that flows through the grid context:

```ts
interface GridConfig {
  columns: number // Number of grid columns (default: 12)
  containerWidth: string | number // Max width of the container
  gap: number // Gap between columns in pixels
  gutter: number // Container horizontal padding in pixels
  padding: number // Additional padding value
}
```

### Default Breakpoints

The default breakpoints follow the Bootstrap 4 standard:

| Breakpoint | Min Width | Typical Device           |
| ---------- | --------- | ------------------------ |
| `xs`       | 0px       | Extra small phones       |
| `sm`       | 576px     | Small phones (landscape) |
| `md`       | 768px     | Tablets                  |
| `lg`       | 992px     | Laptops/desktops         |
| `xl`       | 1200px    | Large desktops           |

### Default Container Widths

Each breakpoint has a recommended container max-width:

| Breakpoint | Container Width |
| ---------- | --------------- |
| `xs`       | `100%`          |
| `sm`       | `540px`         |
| `md`       | `720px`         |
| `lg`       | `960px`         |
| `xl`       | `1140px`        |

### Custom Column Counts

While 12 columns is the default, you can use any column count. Common alternatives:

```tsx
// 24-column grid for finer control
<Container columns={24} gap={16}>
  <Row>
    <Col xs={16}>Two-thirds</Col>
    <Col xs={8}>One-third</Col>
  </Row>
</Container>

// 6-column grid for simple layouts
<Container columns={6} gap={24}>
  <Row>
    <Col xs={2}>One</Col>
    <Col xs={2}>Two</Col>
    <Col xs={2}>Three</Col>
  </Row>
</Container>

// Mixed column counts -- Row overrides Container
<Container columns={12} gap={16}>
  <Row>
    <Col xs={6}>Half (12-col)</Col>
    <Col xs={6}>Half (12-col)</Col>
  </Row>
  <Row columns={24}>
    <Col xs={8}>Third (24-col)</Col>
    <Col xs={8}>Third (24-col)</Col>
    <Col xs={8}>Third (24-col)</Col>
  </Row>
</Container>
```

---

## Layout Examples

### Basic Two-Column Layout

```tsx
<Container maxWidth={960} gap={24}>
  <Row>
    <Col xs={12} md={8}>
      Main content
    </Col>
    <Col xs={12} md={4}>
      Sidebar
    </Col>
  </Row>
</Container>
```

### Centered Narrow Content

```tsx
<Container maxWidth={1140}>
  <Row alignX="center">
    <Col xs={12} md={8} lg={6}>
      Centered content
    </Col>
  </Row>
</Container>
```

### Card Grid

```tsx
<Container maxWidth={1200} gap={16} gutter={16}>
  <Row>
    {items.map((item) => (
      <Col xs={12} sm={6} lg={4} xl={3}>
        <div class="card">{item.title}</div>
      </Col>
    ))}
  </Row>
</Container>
```

### Holy Grail Layout (Header + Sidebar + Content + Footer)

```tsx
function HolyGrailLayout(props: {
  header: VNodeChild
  sidebar: VNodeChild
  content: VNodeChild
  footer: VNodeChild
}) {
  return (
    <Container maxWidth={1200} gap={24} gutter={16}>
      {/* Header -- full width */}
      <Row>
        <Col xs={12}>
          <header class="site-header">{props.header}</header>
        </Col>
      </Row>
      {/* Main area -- sidebar + content */}
      <Row>
        <Col xs={12} md={3}>
          <aside class="sidebar">{props.sidebar}</aside>
        </Col>
        <Col xs={12} md={9}>
          <main class="main-content">{props.content}</main>
        </Col>
      </Row>
      {/* Footer -- full width */}
      <Row>
        <Col xs={12}>
          <footer class="site-footer">{props.footer}</footer>
        </Col>
      </Row>
    </Container>
  )
}
```

### Dashboard Layout

```tsx
function DashboardLayout(props: {
  stats: { label: string; value: string }[]
  chart: VNodeChild
  recentActivity: VNodeChild
  quickActions: VNodeChild
}) {
  return (
    <Container maxWidth={1400} gap={24} gutter={24}>
      {/* Stats row -- 4 equal columns */}
      <Row>
        {props.stats.map((stat) => (
          <Col xs={6} lg={3}>
            <div class="stat-card">
              <div class="stat-value">{stat.value}</div>
              <div class="stat-label">{stat.label}</div>
            </div>
          </Col>
        ))}
      </Row>
      {/* Chart + Activity */}
      <Row>
        <Col xs={12} lg={8}>
          <div class="chart-card">{props.chart}</div>
        </Col>
        <Col xs={12} lg={4}>
          <div class="activity-card">{props.recentActivity}</div>
        </Col>
      </Row>
      {/* Quick actions -- full width */}
      <Row>
        <Col xs={12}>{props.quickActions}</Col>
      </Row>
    </Container>
  )
}
```

### Blog Post Layout

```tsx
function BlogPostLayout(props: {
  title: string
  meta: VNodeChild
  content: VNodeChild
  relatedPosts: VNodeChild
}) {
  return (
    <Container maxWidth={1200} gap={32}>
      {/* Title -- centered, narrow */}
      <Row alignX="center">
        <Col xs={12} md={8}>
          <h1 class="post-title">{props.title}</h1>
          {props.meta}
        </Col>
      </Row>
      {/* Content -- centered, narrow */}
      <Row alignX="center">
        <Col xs={12} md={8}>
          <article class="post-content">{props.content}</article>
        </Col>
      </Row>
      {/* Related posts -- full width, 3-column grid */}
      <Row>
        <Col xs={12}>
          <h2>Related Posts</h2>
        </Col>
      </Row>
      <Row>{props.relatedPosts}</Row>
    </Container>
  )
}
```

### Sidebar with Content

```tsx
function SidebarLayout(props: {
  sidebar: VNodeChild
  content: VNodeChild
  sidebarPosition?: 'left' | 'right'
}) {
  const isRight = props.sidebarPosition === 'right'

  return (
    <Container maxWidth={1200} gap={24} gutter={16}>
      <Row>
        <Col xs={12} md={3} order={isRight ? 2 : 1}>
          <aside class="sidebar">{props.sidebar}</aside>
        </Col>
        <Col xs={12} md={9} order={isRight ? 1 : 2}>
          <main>{props.content}</main>
        </Col>
      </Row>
    </Container>
  )
}
```

### Nested Grids

Grids can be nested. A Col can contain its own Row and Col children:

```tsx
<Container maxWidth={1200} gap={24}>
  <Row>
    {/* Main content area */}
    <Col xs={12} md={8}>
      <h1>Product Gallery</h1>
      {/* Nested grid within the main column */}
      <Row gap={16}>
        <Col xs={6}>
          <img src="/product-1.jpg" style="width: 100%;" />
        </Col>
        <Col xs={6}>
          <img src="/product-2.jpg" style="width: 100%;" />
        </Col>
        <Col xs={6}>
          <img src="/product-3.jpg" style="width: 100%;" />
        </Col>
        <Col xs={6}>
          <img src="/product-4.jpg" style="width: 100%;" />
        </Col>
      </Row>
    </Col>
    {/* Sidebar */}
    <Col xs={12} md={4}>
      <div class="product-details">
        <h2>Product Name</h2>
        <p>Product description...</p>
      </div>
    </Col>
  </Row>
</Container>
```

When nesting, the inner Row reads from the nearest Container context. If the inner Row is inside a Col that is inside a Row, it picks up the same Container config. You can override `gap` and `columns` on the inner Row independently.

### Equal-Height Cards

Use `alignY: 'stretch'` on the Row to make all columns the same height:

```tsx
<Container maxWidth={1200} gap={24}>
  <Row alignY="stretch">
    <Col xs={12} md={4}>
      <div
        class="card"
        style="height: 100%; display: flex; flex-direction: column; padding: 16px; border: 1px solid #ddd; border-radius: 8px;"
      >
        <h3>Short Title</h3>
        <p style="flex: 1;">Short content.</p>
        <button>Action</button>
      </div>
    </Col>
    <Col xs={12} md={4}>
      <div
        class="card"
        style="height: 100%; display: flex; flex-direction: column; padding: 16px; border: 1px solid #ddd; border-radius: 8px;"
      >
        <h3>Longer Title Here</h3>
        <p style="flex: 1;">
          This card has much more content that makes it taller than the others. The other cards will
          stretch to match.
        </p>
        <button>Action</button>
      </div>
    </Col>
    <Col xs={12} md={4}>
      <div
        class="card"
        style="height: 100%; display: flex; flex-direction: column; padding: 16px; border: 1px solid #ddd; border-radius: 8px;"
      >
        <h3>Medium Title</h3>
        <p style="flex: 1;">Medium amount of content.</p>
        <button>Action</button>
      </div>
    </Col>
  </Row>
</Container>
```

### Centered Content with Offset

```tsx
// Method 1: Using Row alignment
<Container maxWidth={1200}>
  <Row alignX="center">
    <Col xs={12} md={6}>Centered with alignX</Col>
  </Row>
</Container>

// Method 2: Using offset
<Container maxWidth={1200}>
  <Row>
    <Col xs={8} offset={2}>Centered with offset</Col>
  </Row>
</Container>
```

---

## Comparison with CSS Approaches

### vs. CSS Grid

CSS Grid (`display: grid`) is a two-dimensional layout system. Coolgrid uses flexbox internally, which is one-dimensional (row-based). Key differences:

- **Coolgrid** works through Pyreon's context system with automatic configuration inheritance
- **CSS Grid** gives you explicit row and column placement in CSS
- **Coolgrid** handles gutter math automatically
- **CSS Grid** uses native `gap` without the negative-margin technique

Use Coolgrid when you want a component-based grid with automatic configuration cascading. Use CSS Grid directly when you need precise two-dimensional placement.

### vs. Raw Flexbox

Coolgrid is built on flexbox but handles the common boilerplate:

- Percentage width calculation
- Gutter/gap math with negative margins
- Alignment mapping from friendly names to CSS values
- Configuration inheritance through context

You could achieve the same layouts with raw flexbox styles, but Coolgrid encapsulates the patterns into reusable components.

---

## Standalone Row + Col

You can use Row and Col without a Container. When there is no Container context, Row defaults to 12 columns and 0 gap, or uses the values you pass explicitly:

```tsx
// Standalone Row with explicit config
<Row columns={6} gap={12}>
  <Col xs={2}>One-third</Col>
  <Col xs={2}>One-third</Col>
  <Col xs={2}>One-third</Col>
</Row>
```

The Col will read the Row's config from context. You lose the centering and gutter behavior of Container, but the column width calculations work the same.

---

## API Reference

| Export                   | Type      | Description                                                                                                  |
| ------------------------ | --------- | ------------------------------------------------------------------------------------------------------------ |
| `Container`              | Component | Outermost grid wrapper with centering, max-width, and gutters. Provides grid config via context.             |
| `Row`                    | Component | Flex row container for columns. Reads Container context, provides Row context. Supports alignment overrides. |
| `Col`                    | Component | Grid column with span, offset, and order. Reads Row context for gap and column count.                        |
| `defaultBreakpoints`     | Object    | Default breakpoint map: `&#123; xs: 0, sm: 576, md: 768, lg: 992, xl: 1200 &#125;`                           |
| `defaultContainerWidths` | Object    | Default max-widths per breakpoint: `&#123; xs: '100%', sm: 540, md: 720, lg: 960, xl: 1140 &#125;`           |
| `defaultGridConfig`      | Object    | Default GridConfig: `&#123; columns: 12, containerWidth: '100%', gap: 0, gutter: 0, padding: 0 &#125;`       |

## Types

| Type             | Description                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `ContainerProps` | Props for `Container`. Includes `maxWidth`, `columns`, `gap`, `gutter`, `padding`, `tag`, `class`, `style`, `children`.                       |
| `RowProps`       | Props for `Row`. Includes `gap`, `columns`, `alignX`, `alignY`, `tag`, `class`, `style`, `children`.                                          |
| `ColProps`       | Props for `Col`. Includes `xs`, `sm`, `md`, `lg`, `xl`, `offset`, `order`, `tag`, `class`, `style`, `children`.                               |
| `GridConfig`     | Grid configuration object: `&#123; columns, containerWidth, gap, gutter, padding &#125;`. Flows through context from Container to Row to Col. |
