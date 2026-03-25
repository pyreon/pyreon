# @pyreon/styler

Lightweight CSS-in-JS engine for Pyreon.

**3.81 KB** gzipped | **SSR & static export ready** | **TypeScript strict**

## Installation

```bash
bun add @pyreon/styler
```

## Quick Start

```ts
import { styled, css, ThemeContext } from '@pyreon/styler'
import { useContext, pushContext, popContext, onUnmount } from '@pyreon/core'

const Button = styled('button')`
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.primary};
  color: white;
  cursor: pointer;

  &:hover {
    opacity: 0.9;
  }
`
```

## API

### `styled(tag)`

Creates a styled Pyreon component from an HTML tag or another component.

```ts
// HTML tag
const Box = styled('div')`
  display: flex;
`

// Shorthand (via Proxy)
const Box = styled.div`
  display: flex;
`

// Wrapping a component
const StyledLink = styled(Link)`
  color: blue;
  text-decoration: none;
`
```

#### Dynamic interpolations

Function interpolations receive all props plus the current `theme`:

```ts
const Text = styled('p')`
  color: ${({ theme }) => theme.colors.text};
  font-size: ${(props) => props.$size || '16px'};
`
```

#### Polymorphic `as` prop

Render as a different element at runtime:

```ts
const Box = styled('div')`padding: 16px;`

// Renders as a <section>
Box({ as: 'section', children: 'Content' })
```

#### Transient props

Props prefixed with `$` are not forwarded to the DOM:

```ts
const Box = styled('div')`
  color: ${(p) => p.$active ? 'blue' : 'gray'};
`

// $active is used for styling but won't appear on the <div>
Box({ $active: true })
```

#### Custom prop filtering

```ts
const Box = styled('div', {
  shouldForwardProp: (prop) => prop !== 'size',
})`
  font-size: ${(p) => p.size}px;
`
```

### `css`

Tagged template for composable CSS fragments:

```ts
const flexCenter = css`
  display: flex;
  align-items: center;
  justify-content: center;
`

const Card = styled('div')`
  ${flexCenter};
  padding: 16px;
`
```

Supports conditional patterns:

```ts
const Box = styled('div')`
  display: flex;
  ${(props) => props.$bordered && css`
    border: 1px solid #e0e0e0;
    border-radius: 4px;
  `};
`
```

### `keyframes`

Creates `@keyframes` animations:

```ts
const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`

const FadeBox = styled('div')`
  animation: ${fadeIn} 300ms ease-in;
`
```

### `createGlobalStyle`

Injects global CSS rules (not scoped to a class):

```ts
const GlobalStyle = createGlobalStyle`
  *, *::before, *::after {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    font-family: ${({ theme }) => theme.font};
  }
`
```

### `ThemeContext` & `useTheme`

Provides a theme object to all nested styled components via Pyreon's context system:

```ts
import { ThemeContext, useTheme } from '@pyreon/styler'
import { pushContext, onUnmount, popContext } from '@pyreon/core'

// Provide theme
pushContext(new Map([[ThemeContext.id, myTheme]]))
onUnmount(() => popContext())
```

Access the theme from any component:

```ts
const MyComponent = () => {
  const theme = useTheme()
  // use theme values
}
```

#### TypeScript theme augmentation

Extend `DefaultTheme` for strict typing across your app:

```ts
declare module '@pyreon/styler' {
  interface DefaultTheme {
    colors: { primary: string; text: string }
    spacing: (n: number) => string
  }
}
```

### `sheet` & `createSheet`

The singleton `sheet` manages CSS rule injection. For SSR, use `createSheet` for per-request isolation:

```ts
import { createSheet } from '@pyreon/styler'

const sheet = createSheet()
const html = renderToString(App({}))
const styleTags = sheet.getStyleTag()
sheet.reset()
```

#### `@layer` support

Wrap all scoped rules in a CSS Cascade Layer:

```ts
const sheet = createSheet({ layer: 'components' })
```

## How It Works

### Static path (zero runtime cost)

Templates with no function interpolations are resolved **once at component creation time**. The CSS class, rules, and `<style>` element are pre-computed and cached.

### Dynamic path

Templates with function interpolations resolve on every render. A cache skips `sheet.prepare()` and `<style>` element creation when the resolved CSS text hasn't changed.

### CSS Nesting

Native CSS nesting is supported out of the box. The engine passes CSS through without transformation, so `&:hover`, `&::before`, nested selectors, and `@media` queries work as-is in all modern browsers.

```ts
const Card = styled('div')`
  padding: 16px;

  &:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  & > h2 {
    margin: 0 0 8px;
  }

  @media (min-width: 768px) {
    padding: 24px;
  }
`
```

## Benchmarks

### Bundle Size

| Library | Minified | Gzipped |
|---------|--------:|--------:|
| goober | 2.32 KB | 1.31 KB |
| **@pyreon/styler** | **10.13 KB** | **3.81 KB** |
| styled-components | 44.93 KB | 17.89 KB |
| @emotion/react + styled | 48.26 KB | 16.59 KB |

### Performance (ops/sec, higher is better)

| Benchmark | styler | styled-components | @emotion | goober |
|-----------|-------:|-------------------:|---------:|-------:|
| css() creation | **25.2M** | 9.0M | 2.2M | 26K |
| css() with interpolations | **24.9M** | 5.6M | 2.3M | 28K |
| Template resolution | **21.4M** | 3.9M | — | — |
| Nested composition | **8.3M** | 2.2M | 1.4M | 8K |
| SSR renderToString | **307K** | 69K | 192K | 18K |
| styled() factory | **17.3M** | 109K | 933K | 18.2M |

## Peer Dependencies

| Package | Version |
| ------- | ------- |
| @pyreon/core | >= 0.0.1 |
| @pyreon/reactivity | >= 0.0.1 |

## License

MIT
