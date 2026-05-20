# @pyreon/coolgrid

Context-cascading responsive grid — Container, Row, Col with custom columns and breakpoints.

`@pyreon/coolgrid` is a Bootstrap-style flexbox grid where every numeric prop is responsive (single value, mobile-first array, or breakpoint-keyed object). Configuration (`columns`, `gap`, `gutter`, `padding`, `contentAlignX`) cascades through Pyreon's context system — set it on `Container` and every nested `Row` / `Col` inherits, with explicit per-element overrides. Breakpoint names and column counts are not hardcoded: ship with the default Bootstrap-4 theme or define your own (`{ phone: 0, tablet: 600, desktop: 1024 }` × `columns: 24`). Built on `@pyreon/unistyle` + `@pyreon/styler`.

## Install

```bash
bun add @pyreon/coolgrid @pyreon/core @pyreon/reactivity @pyreon/ui-core @pyreon/unistyle @pyreon/styler
```

## Quick start

```tsx
import { Provider, Container, Row, Col, theme } from '@pyreon/coolgrid'

<Provider theme={theme}>
  <Container>
    <Row>
      <Col size={{ xs: 12, md: 8 }}>Main content</Col>
      <Col size={{ xs: 12, md: 4 }}>Sidebar</Col>
    </Row>
  </Container>
</Provider>
```

Provider wraps `@pyreon/unistyle`'s provider — it scopes breakpoints, root-size, and grid defaults to the subtree. One provider per app at the root.

## Components

### `<Container>` — outermost grid boundary

Sets max-width and seeds the configuration context for descendants.

```tsx
<Container columns={12} gap={16} gutter={24} padding={16} width={{ xs: '100%', lg: 1140 }}>
  <Row>…</Row>
</Container>
```

| Prop | Type | Description |
|---|---|---|
| `columns` | `ValueType` | Number of grid columns (default 12) |
| `gap` | `ValueType` | Space between columns |
| `gutter` | `ValueType` | Outer gutter (negative-margin offset on Row) |
| `padding` | `ValueType` | Column inner padding |
| `contentAlignX` | `'center' \| 'left' \| 'right' \| 'spaceAround' \| 'spaceBetween' \| 'spaceEvenly'` | Horizontal alignment |
| `width` | `ContainerWidth \| (widths) => ContainerWidth` | Container max-width override |
| `component` | `ComponentFn` | Custom root element |
| `css` | `ExtraStyles` | Extend container styling |

Container-level configuration props cascade to every nested Row and Col through context (built on Pyreon's `pushContext` / `popContext`).

### `<Row>` — flex wrapper

Inherits Container config; can override any cascading prop.

```tsx
<Row contentAlignX="center" gap={[8, 16, 24]}>
  <Col>One</Col>
  <Col>Two</Col>
</Row>
```

Setting `size` on Row applies it as the DEFAULT for every Col inside:

```tsx
<Row size={6}>
  <Col>Half</Col>
  <Col>Half</Col>
</Row>
```

### `<Col>` — individual column

Width is calculated as `(size / columns)` of the parent Row.

```tsx
<Col size={4}>1/3 width on every breakpoint</Col>
<Col size={{ xs: 12, sm: 6, lg: 4 }}>Responsive</Col>
<Col size={{ xs: 0, md: 6 }}>Hidden on xs (size 0 → display:none)</Col>
```

| Prop | Type | Description |
|---|---|---|
| `size` | `ValueType` | Column span (of `columns`) |
| `padding` | `ValueType` | Override inner padding |
| `component` | `ComponentFn` | Custom column element |
| `css` | `ExtraStyles` | Extend column styling |

## Responsive values

Every numeric prop accepts three shapes:

```ts
// Single value — applies at every breakpoint
size={6}

// Mobile-first array — positional [xs, sm, md, lg, xl]
size={[12, 6, 4]}

// Breakpoint-keyed object — explicit
size={{ xs: 12, md: 6, lg: 4 }}
```

## Custom breakpoints / columns

```tsx
<Provider
  theme={{
    rootSize: 16,
    breakpoints: { phone: 0, tablet: 600, desktop: 1024, wide: 1440 },
    grid: {
      columns: 24,
      container: { phone: '100%', tablet: 540, desktop: 960, wide: 1400 },
    },
  }}
>
  <Container columns={24}>
    <Row>
      <Col size={16}>Two thirds of 24</Col>
      <Col size={8}>One third of 24</Col>
    </Row>
  </Container>
</Provider>
```

## Default theme

The `theme` export ships Bootstrap-4 defaults:

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

## Cascading model

```text
<Container columns={12} gap={16}>
   ↓ context push
  <Row>          inherits columns=12, gap=16; can override
     ↓ context push
    <Col size={4}> inherits columns, gap → width = 4 / 12 = 33.33%
```

Each level pushes its overrides into the context; children read the merged stack. Props set at a deeper level override the ancestor for that subtree only.

## Custom underlying elements

Swap any layer's root element via `component`:

```tsx
<Container component={MyContainerWrapper}>
  <Row component="section">
    <Col component="article">…</Col>
  </Row>
</Container>
```

## Gotchas

- **`Provider` is the unistyle provider** under the hood. If you already render `<PyreonUI>` (from `@pyreon/ui-core`) at your app root, it sets up unistyle context — you only need a fresh `<Provider>` if you want different breakpoints in a subtree.
- **`size: 0` is meaningful** — it sets the column to `display: none` at that breakpoint (hidden), not "zero-width but still in flow".
- **`gutter` is negative-margin on the Row** + matching padding on each Col. Setting `gutter` and `padding` independently is fine but be aware of the visual offset.
- **`columns` MUST be set on a Container** if you want a non-default count. Setting it on a Row works for that Row only, but the visual cascade is harder to reason about — keep it at Container level.
- **Context is per-Provider.** If you nest two `<Provider>` blocks, the inner one starts fresh from its own theme — not from the outer Provider's overrides.

## Documentation

Full docs: [docs.pyreon.dev/docs/coolgrid](https://docs.pyreon.dev/docs/coolgrid) (or `docs/docs/coolgrid.md` in this repo).

## License

MIT
