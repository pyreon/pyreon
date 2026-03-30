---
title: Styler
description: CSS-in-JS engine for Pyreon with tagged templates, theming, keyframes, and SSR support.
---

`@pyreon/styler` is a lightweight CSS-in-JS library built for Pyreon. It provides a `styled` API using tagged template literals, a shared stylesheet with automatic deduplication, theming via context, and `@keyframes` support. It works on both client and server (SSR).

<PackageBadge name="@pyreon/styler" href="/docs/styler" />

## Installation

::: code-group

```bash [npm]
npm install @pyreon/styler
```

```bash [bun]
bun add @pyreon/styler
```

```bash [pnpm]
pnpm add @pyreon/styler
```

```bash [yarn]
yarn add @pyreon/styler
```

:::

## Quick Start

```tsx
import { styled, css, keyframes, useTheme, ThemeContext } from '@pyreon/styler'
import { h } from '@pyreon/core'

const Button = styled('button')`
  background: ${props => props.primary ? 'royalblue' : '#e2e2e2'};
  color: ${props => props.primary ? 'white' : '#333'};
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
`

// Usage
<Button primary={true}>Click me</Button>
```

## `css` Tagged Template

The `css` function creates a lazy `CSSResult` from a tagged template literal. It does **not** inject styles immediately -- the result must be resolved before injection.

```ts
import { css } from "@pyreon/styler";

const baseStyles = css`
  font-size: 14px;
  line-height: 1.5;
`;
```

`css` returns a `CSSResult` instance that stores the template strings and interpolated values as-is. No CSS processing happens at creation time.

### Interpolations

Values interpolated into `css` templates can be:

- **Strings and numbers** -- inserted directly into the CSS string.
- **Functions** -- called with the current props object at resolution time, and the return value is resolved recursively.
- **Nested `CSSResult`** -- resolved and inlined.
- **Booleans, `null`, `undefined`** -- produce an empty string (useful for conditional styles).

```ts
const dynamicStyles = css`
  color: ${(props) => (props.active ? "blue" : "gray")};
  opacity: ${(props) => (props.disabled ? 0.5 : 1)};
`;
```

### Static Interpolations

String and number interpolations are static -- they are resolved once and never re-evaluated:

```ts
const color = "red";
const size = 16;
const styles = css`
  color: ${color};
  font-size: ${size}px;
`;
```

### Nested CSS Results

You can compose `css` results by nesting them:

```ts
const resetStyles = css`
  margin: 0;
  padding: 0;
  box-sizing: border-box;
`;

const cardStyles = css`
  ${resetStyles}
  border: 1px solid #ddd;
  border-radius: 8px;
`;
```

### Conditional Styles

Use boolean/null returns for conditional inclusion:

```ts
const styles = css`
  display: flex;
  ${(props) => (props.centered ? "align-items: center; justify-content: center;" : false)}
  ${(props) => (props.gap ? `gap: ${props.gap}px;` : null)}
`;
```

### Multiple Interpolations

A single `css` template can contain any number of interpolations:

```ts
const styles = css`
  color: ${"red"};
  font-size: ${16}px;
  padding: ${8}px ${16}px;
`;
```

### `CSSResult` Class

The `CSSResult` class holds the raw template strings and values. It is the type returned by `css`.

```ts
import { CSSResult } from "@pyreon/styler";

const result = new CSSResult(["color: ", ";"], ["red"]);
```

Properties:

- `strings: TemplateStringsArray | string[]` -- the static template parts
- `values: Interpolation[]` -- the interpolated values

### `resolveCSS(result, props?)`

Resolves a `CSSResult` into a plain CSS string. Optionally pass a props object to resolve dynamic interpolation functions.

```ts
import { css, resolveCSS } from "@pyreon/styler";

const result = css`
  color: red;
  font-size: 14px;
`;
const cssString = resolveCSS(result);
// => "color: red; font-size: 14px;"
```

With dynamic props:

```ts
const result = css`
  color: ${(props) => props.color};
`;
const cssString = resolveCSS(result, { color: "blue" });
// => "color: blue;"
```

During resolution:

- Comments (both `/* ... */` and `//` line comments) are stripped
- Whitespace is collapsed (newlines, tabs, multiple spaces become single spaces)
- URLs containing `://` are preserved correctly

## `styled(tag, options?)`

Creates a styled Pyreon component. Returns a tagged template function that produces a `ComponentFn`.

```ts
import { styled } from "@pyreon/styler";

const Card = styled("div")`
  padding: 16px;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`;
```

The two-step API: `styled(tag)` returns a tagged template function, and calling that with a template literal returns the component.

### Static CSS (Fast Path)

When all interpolations are static (no functions), the CSS class is computed once at component creation time and reused for every render. This is the fast path -- no per-render work is needed.

```ts
const StaticBox = styled("div")`
  display: flex;
  padding: 16px;
  background: #f5f5f5;
`;
// Class computed once, reused on every render
```

Static interpolations (strings and numbers) also use the fast path:

```ts
const color = "royalblue";
const padding = 12;

const StaticButton = styled("button")`
  color: ${color};
  padding: ${padding}px;
`;
// Still static — class computed once
```

### Dynamic Styles

Interpolation functions receive the component's props, enabling dynamic styling. When any interpolation is a function, CSS is resolved on every render with the current props:

```ts
const Alert = styled('div')`
  padding: 12px 16px;
  border-radius: 4px;
  background: ${props => {
    switch (props.variant) {
      case 'error': return '#fee2e2'
      case 'success': return '#dcfce7'
      case 'warning': return '#fef9c3'
      default: return '#f0f0f0'
    }
  }};
  color: ${props => {
    switch (props.variant) {
      case 'error': return '#991b1b'
      case 'success': return '#166534'
      case 'warning': return '#854d0e'
      default: return '#333'
    }
  }};
`

<Alert variant="error">Something went wrong</Alert>
<Alert variant="success">Operation completed</Alert>
```

Different prop values produce different CSS and therefore different class names. Same prop values produce the same class name (deduplication via the sheet cache).

### Polymorphic `as` Prop

Every styled component accepts an `as` prop to change the rendered HTML tag at the call site:

```ts
const Text = styled('span')`
  font-size: 16px;
  color: #333;
`

// Renders as a <p> tag instead of <span>
<Text as="p">Paragraph text</Text>

// Renders as an <h1>
<Text as="h1">Heading text</Text>

// Renders as a <label>
<Text as="label">Label text</Text>
```

When `as` is not provided, the original tag is used.

### `shouldForwardProp`

By default, standard HTML attributes, event handlers (`on*`), `data-*`, and `aria-*` props are forwarded to the DOM element. Custom styling props (like `primary`, `variant`, `spacing`) are filtered out automatically to prevent invalid DOM attributes.

The default forwarding set includes:

- Standard attributes: `id`, `class`, `style`, `title`, `role`, `tabIndex`, `href`, `src`, `alt`, `type`, `name`, `value`, `checked`, `disabled`, `readonly`, `placeholder`, `for`, `action`, `method`, `target`, `rel`, `width`, `height`, `min`, `max`, `step`, `pattern`, `required`, `autofocus`, `hidden`, `draggable`, `contentEditable`, `loading`, `ref`, `key`, `children`, and more
- Event handlers: any prop starting with `on` (e.g., `onClick`, `onMouseEnter`)
- Data attributes: any prop starting with `data-`
- ARIA attributes: any prop starting with `aria-`

Override this behavior with the `shouldForwardProp` option:

```ts
const Box = styled('div', {
  shouldForwardProp: (prop) => prop !== 'spacing',
})`
  padding: ${props => props.spacing}px;
`

// 'spacing' is used for styles but not forwarded to the DOM
<Box spacing={16} id="my-box" />
// Renders: <div id="my-box" class="ns-...">
```

Block all prop forwarding:

```ts
const PureStyled = styled("div", {
  shouldForwardProp: () => false,
})`
  display: flex;
`;
// Only class is set, no other props forwarded
```

### Class Merging

Styled components merge user-provided `class` or `className` props with the generated class name:

```ts
const Box = styled('div')`display: flex;`

<Box class="custom-class" />
// class="ns-abc123 custom-class"

<Box class="react-style" />
// class="ns-abc123 react-style"
```

When the CSS is empty, only the user class is applied:

```ts
const Empty = styled('div')``
<Empty class="only-this" />
// class="only-this"
```

### Children Forwarding

Children are passed through to the underlying element:

```ts
const Wrapper = styled('div')`padding: 16px;`

// Single child
<Wrapper>Hello</Wrapper>

// Multiple children
<Wrapper><span>A</span><span>B</span></Wrapper>

// Array children
<Wrapper children={['a', 'b', 'c']} />
```

### Empty CSS

When the CSS template resolves to an empty string (or only whitespace), no class name is generated:

```ts
const NoStyles = styled("div")``;
// Renders <div> with no class attribute

const WhitespaceOnly = styled("div")``;
// Same — no class generated
```

## `styledElements` Proxy

A convenience proxy for common HTML tags. Instead of `styled('div')`, write `s.div`:

```ts
import { styledElements as s } from "@pyreon/styler";

const Title = s.h1`
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 16px;
`;

const Subtitle = s.h2`
  font-size: 18px;
  font-weight: 500;
  color: #666;
`;

const Link = s.a`
  color: royalblue;
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`;

const Container = s.section`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 16px;
`;

const Input = s.input`
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
`;

const Button = s.button`
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
`;
```

This is equivalent to calling `styled('h1')`, `styled('a')`, `styled('section')`, etc. Any valid HTML tag name works.

## `keyframes`

Define CSS `@keyframes` animations. Returns the generated animation name that you can use in style rules.

```ts
import { keyframes, styled } from "@pyreon/styler";

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const Spinner = styled("div")`
  width: 24px;
  height: 24px;
  border: 2px solid #ccc;
  border-top-color: royalblue;
  border-radius: 50%;
  animation: ${spin} 1s linear infinite;
`;
```

The returned string is a unique animation name (e.g., `ns-kf-abc123`) generated from an FNV-1a hash of the keyframes CSS. The `@keyframes` rule is injected into the stylesheet immediately.

### Fade In/Out

```ts
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const fadeOut = keyframes`
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(10px); }
`;

const FadeInBox = styled("div")`
  animation: ${fadeIn} 0.3s ease-out forwards;
`;
```

### Pulse

```ts
const pulse = keyframes`
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
`;

const PulseButton = styled("button")`
  animation: ${pulse} 2s ease-in-out infinite;
  padding: 12px 24px;
  background: royalblue;
  color: white;
  border: none;
  border-radius: 4px;
`;
```

### Slide In

```ts
const slideInFromLeft = keyframes`
  from { transform: translateX(-100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
`;

const slideInFromRight = keyframes`
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
`;

const SlidePanel = styled("div")`
  animation: ${(props) => (props.direction === "left" ? slideInFromLeft : slideInFromRight)} 0.4s
    ease-out;
`;
```

### Skeleton Loading

```ts
const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

const Skeleton = styled("div")`
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: ${shimmer} 1.5s ease-in-out infinite;
  border-radius: 4px;
  height: ${(props) => props.height || "20px"};
  width: ${(props) => props.width || "100%"};
`;
```

## `sheet` (StyleSheet)

The singleton stylesheet manager that handles all CSS injection. You rarely need to interact with it directly, but it is available for advanced use cases.

### How It Works

The `StyleSheet` class maintains:

- A **cache** (`Map<string, string>`) that maps CSS strings to generated class names for deduplication
- A **`<style>` element** (client-side) injected into `document.head` with a `data-nova-styler` attribute
- An **SSR rules buffer** (server-side) that collects rules as strings

The sheet automatically detects whether it is running in a browser or server environment via `typeof document === 'undefined'`.

### `sheet.insert(css)`

Inserts a CSS rule and returns the generated class name. Rules are deduplicated -- inserting the same CSS twice returns the same class name without creating a duplicate rule.

```ts
import { sheet } from "@pyreon/styler";

const className = sheet.insert("color: red; font-size: 14px;");
// => "ns-abc123"

// Same CSS returns same class (deduplication)
const same = sheet.insert("color: red; font-size: 14px;");
// same === className
```

The generated class name has the format `ns-&#123;hash&#125;` where the hash is a base-36 FNV-1a hash of the CSS string.

### Cache Eviction

The sheet maintains a maximum cache size of 10,000 entries. When the cache exceeds this limit, the oldest 10% of entries are evicted. This prevents unbounded memory growth in long-running applications with highly dynamic styles.

### `sheet.insertKeyframes(name, css)`

Inserts a `@keyframes` rule and returns the generated animation name. Used internally by the `keyframes` function.

```ts
const animName = sheet.insertKeyframes("", "from { opacity: 0; } to { opacity: 1; }");
// => "ns-kf-xyz789"
// Injects: @keyframes ns-kf-xyz789 { from { opacity: 0; } to { opacity: 1; } }
```

### `sheet.insertGlobal(css)`

Inserts a global (unscoped) CSS rule. The rule is not wrapped in a class selector.

```ts
sheet.insertGlobal("body { margin: 0; font-family: system-ui; }");
sheet.insertGlobal("*, *::before, *::after { box-sizing: border-box; }");
sheet.insertGlobal(":root { --primary: royalblue; --text: #333; }");
```

### `sheet.getSSRStyles()`

Returns all accumulated rules as a `<style>` tag string for server-side rendering. Returns an empty string if no rules have been inserted.

```ts
const html = sheet.getSSRStyles();
// => '<style data-nova-styler>.ns-abc123 { color: red; }@keyframes ns-kf-xyz { ... }</style>'
```

### `sheet.reset()`

Clears the entire cache, empties the SSR rules buffer, and removes the injected `<style>` element from the DOM. Useful for testing:

```ts
import { sheet } from "@pyreon/styler";

afterEach(() => {
  sheet.reset();
});
```

## SSR (Server-Side Rendering)

On the server (`typeof document === 'undefined'`), the sheet collects rules in an in-memory buffer instead of injecting into a DOM `<style>` element.

### Basic SSR Flow

```ts
import { styled, sheet } from "@pyreon/styler";

// 1. Render your components (this inserts rules into the sheet)
const Button = styled("button")`
  background: royalblue;
  color: white;
  padding: 8px 16px;
`;

// ... render your component tree ...

// 2. Collect the generated styles
const styleTag = sheet.getSSRStyles();
// '<style data-nova-styler>.ns-abc { background: royalblue; color: white; padding: 8px 16px; }</style>'

// 3. Inject into your HTML template
const html = `
  <!DOCTYPE html>
  <html>
    <head>${styleTag}</head>
    <body>${renderedApp}</body>
  </html>
`;

// 4. Reset for the next request
sheet.reset();
```

### Per-Request Isolation

For server environments handling multiple requests, reset the sheet between requests to prevent style leakage:

```ts
function handleRequest(req, res) {
  sheet.reset();

  // ... render app ...

  const styles = sheet.getSSRStyles();
  const html = renderToString(App);

  res.send(`<html><head>${styles}</head><body>${html}</body></html>`);
}
```

## `hash(str)`

FNV-1a hash function that produces compact base-36 strings. Used internally for class name and animation name generation.

```ts
import { hash } from "@pyreon/styler";

hash("color: red;"); // => "1m3k5q7" (example)
hash("display: flex;"); // => "a2b3c4d" (example)
```

The hash uses the standard FNV-1a algorithm with offset basis `2166136261` and prime `16777619`, then converts to base-36 for compact string representation.

### Deterministic Output

The hash is deterministic -- the same input always produces the same output. This means:

- The same CSS always gets the same class name
- SSR and client hydration produce matching class names
- No runtime randomness or counters

## Theming

### `ThemeContext` and `useTheme`

Provide a theme object via Pyreon's context system and access it in any component.

```ts
import { ThemeContext, useTheme } from '@pyreon/styler'
import { h } from '@pyreon/core'

// Define your theme
const theme = {
  colors: {
    primary: 'royalblue',
    secondary: '#6c757d',
    success: '#28a745',
    danger: '#dc3545',
    text: '#333',
    background: '#fff',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  radii: {
    sm: 4,
    md: 8,
    lg: 16,
    full: 9999,
  },
  fonts: {
    body: 'system-ui, -apple-system, sans-serif',
    mono: 'ui-monospace, monospace',
  },
}

// Provide the theme at the app root
<ThemeContext.Provider value={theme}>
  <App />
</ThemeContext.Provider>
```

### Accessing the Theme

Use `useTheme()` inside any component within the provider tree:

```ts
function ThemedCard(props) {
  const theme = useTheme()

  return <div style={{
      padding: `${theme.spacing.md}px`,
      borderRadius: `${theme.radii.md}px`,
      fontFamily: theme.fonts.body,
      color: theme.colors.text,
    }}>{props.children}</div>
}
```

### Theme with Styled Components

Access the theme inside styled component interpolations via `useTheme()` in the parent component, or structure your app so theme values are passed as props:

```ts
const PrimaryButton = styled("button")`
  background: ${(props) => props.theme?.colors?.primary || "royalblue"};
  color: white;
  padding: ${(props) => props.theme?.spacing?.sm || 8}px
    ${(props) => props.theme?.spacing?.md || 16}px;
  border: none;
  border-radius: ${(props) => props.theme?.radii?.sm || 4}px;
  cursor: pointer;
  font-family: ${(props) => props.theme?.fonts?.body || "system-ui"};
`;
```

### TypeScript Theme Augmentation

Extend the `DefaultTheme` interface with module augmentation to get full type safety across your application:

```ts
// types/theme.d.ts
declare module "@pyreon/styler" {
  interface DefaultTheme {
    colors: {
      primary: string;
      secondary: string;
      success: string;
      danger: string;
      text: string;
      background: string;
    };
    spacing: {
      xs: number;
      sm: number;
      md: number;
      lg: number;
      xl: number;
    };
    radii: {
      sm: number;
      md: number;
      lg: number;
      full: number;
    };
    fonts: {
      body: string;
      mono: string;
    };
  }
}
```

After augmentation, `useTheme()` returns a fully typed theme object:

```ts
const theme = useTheme();
theme.colors.primary; // string -- type-safe
theme.spacing.md; // number -- type-safe
theme.colors.invalid; // TypeScript error
```

### Dark Mode Example

```ts
const lightTheme = {
  colors: {
    primary: 'royalblue',
    text: '#333',
    background: '#ffffff',
    surface: '#f5f5f5',
    border: '#e0e0e0',
  },
}

const darkTheme = {
  colors: {
    primary: '#6ea8fe',
    text: '#e0e0e0',
    background: '#1a1a1a',
    surface: '#2d2d2d',
    border: '#404040',
  },
}

function App() {
  const isDark = signal(false)

  return () => (
    <ThemeContext.Provider value={isDark() ? darkTheme : lightTheme}>
      <MainContent />
    </ThemeContext.Provider>
  )
}
```

## Nested Selectors and Pseudo-Classes

CSS in styled components supports standard CSS selectors including pseudo-classes and pseudo-elements. Because styles are scoped to a generated class, you can use nested patterns freely:

```ts
const InteractiveButton = styled("button")`
  background: royalblue;
  color: white;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: #4169e1;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  &:active {
    transform: translateY(0);
    box-shadow: none;
  }

  &:focus-visible {
    outline: 2px solid royalblue;
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;
```

## Media Queries

Use standard CSS media queries inside styled components:

```ts
const ResponsiveGrid = styled("div")`
  display: grid;
  gap: 16px;
  grid-template-columns: 1fr;

  @media (min-width: 768px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (min-width: 1024px) {
    grid-template-columns: repeat(3, 1fr);
  }

  @media (min-width: 1280px) {
    grid-template-columns: repeat(4, 1fr);
  }
`;

const ResponsiveText = styled("p")`
  font-size: 14px;
  line-height: 1.5;

  @media (min-width: 768px) {
    font-size: 16px;
    line-height: 1.6;
  }

  @media (min-width: 1024px) {
    font-size: 18px;
  }
`;
```

## Real-World Component Examples

### Button with Variants

```ts
import { styled, keyframes, styledElements as s } from '@pyreon/styler'
import { h } from '@pyreon/core'

const Button = styled('button')`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: ${props => {
    switch (props.size) {
      case 'sm': return '4px 8px'
      case 'lg': return '12px 24px'
      default: return '8px 16px'
    }
  }};
  font-size: ${props => {
    switch (props.size) {
      case 'sm': return '12px'
      case 'lg': return '16px'
      default: return '14px'
    }
  }};
  font-weight: 500;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;

  background: ${props => {
    switch (props.variant) {
      case 'primary': return 'royalblue'
      case 'danger': return '#dc3545'
      case 'success': return '#28a745'
      case 'outline': return 'transparent'
      default: return '#e2e2e2'
    }
  }};
  color: ${props => {
    switch (props.variant) {
      case 'primary':
      case 'danger':
      case 'success':
        return 'white'
      case 'outline':
        return 'royalblue'
      default:
        return '#333'
    }
  }};
  ${props => props.variant === 'outline'
    ? 'border: 1px solid royalblue;'
    : ''
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

// Usage
<Button variant="primary" size="lg">Submit</Button>
<Button variant="outline">Cancel</Button>
<Button variant="danger" size="sm">Delete</Button>
```

### Card Component

```ts
const Card = styled('div')`
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
  transition: box-shadow 0.2s ease;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
`

const CardHeader = styled('div')`
  padding: 16px 20px;
  border-bottom: 1px solid #e0e0e0;
  font-weight: 600;
  font-size: 16px;
`

const CardBody = styled('div')`
  padding: 20px;
`

const CardFooter = styled('div')`
  padding: 12px 20px;
  border-top: 1px solid #e0e0e0;
  background: #fafafa;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
`

// Usage
<Card>
  <CardHeader>Card Title</CardHeader>
  <CardBody>Card content goes here...</CardBody>
  <CardFooter>
    <Button variant="outline">Cancel</Button>
    <Button variant="primary">Save</Button>
  </CardFooter>
</Card>
```

### Input with States

```ts
const Input = styled("input")`
  display: block;
  width: 100%;
  padding: 8px 12px;
  font-size: 14px;
  line-height: 1.5;
  color: #333;
  background: white;
  border: 1px solid ${(props) => (props.error ? "#dc3545" : "#ccc")};
  border-radius: 4px;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;

  &::placeholder {
    color: #999;
  }

  &:focus {
    outline: none;
    border-color: ${(props) => (props.error ? "#dc3545" : "royalblue")};
    box-shadow: 0 0 0 3px
      ${(props) => (props.error ? "rgba(220, 53, 69, 0.25)" : "rgba(65, 105, 225, 0.25)")};
  }

  &:disabled {
    background: #f5f5f5;
    cursor: not-allowed;
  }
`;

const Label = styled("label")`
  display: block;
  margin-bottom: 4px;
  font-size: 14px;
  font-weight: 500;
  color: ${(props) => (props.error ? "#dc3545" : "#333")};
`;

const ErrorMessage = styled("span")`
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #dc3545;
`;
```

### Badge Component

```ts
const Badge = styled('span')`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 9999px;
  background: ${props => {
    switch (props.color) {
      case 'green': return '#dcfce7'
      case 'red': return '#fee2e2'
      case 'yellow': return '#fef9c3'
      case 'blue': return '#dbeafe'
      default: return '#f0f0f0'
    }
  }};
  color: ${props => {
    switch (props.color) {
      case 'green': return '#166534'
      case 'red': return '#991b1b'
      case 'yellow': return '#854d0e'
      case 'blue': return '#1e40af'
      default: return '#333'
    }
  }};
`

<Badge color="green">Active</Badge>
<Badge color="red">Error</Badge>
```

## Performance: Static vs Dynamic Splitting

For best performance, separate static base styles from dynamic parts. This allows the static portion to use the fast path (computed once), while only the dynamic portion is re-evaluated per render:

```ts
// Less optimal: entire template is dynamic because of one function interpolation
const Button = styled("button")`
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  background: ${(props) => (props.primary ? "royalblue" : "#e2e2e2")};
`;

// More optimal: use a static base and compose styles via class
const baseButton = css`
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
`;

// Dynamic part is kept minimal
const DynamicButton = styled("button")`
  ${baseButton}
  background: ${(props) => (props.primary ? "royalblue" : "#e2e2e2")};
`;
```

Since the sheet deduplicates by CSS content, identical CSS strings always resolve to the same class. This means you pay zero cost for repeated identical insertions.

## CSS Normalization

All CSS processed by `resolveCSS` goes through a single-pass normalization:

- **Block comments** (`/* ... */`) are stripped
- **Line comments** (`//`) are stripped (but `://` in URLs is preserved)
- **Newlines, tabs, carriage returns** are collapsed to single spaces
- **Consecutive spaces** are collapsed to a single space
- **Leading and trailing whitespace** is trimmed

This ensures consistent hashing regardless of how the template is formatted.

## API Reference

| Export           | Type     | Description                                                      |
| ---------------- | -------- | ---------------------------------------------------------------- |
| `css`            | Function | Tagged template for lazy CSS representation                      |
| `CSSResult`      | Class    | Lazy CSS result holding template strings and interpolated values |
| `resolveCSS`     | Function | Resolves a `CSSResult` into a CSS string                         |
| `hash`           | Function | FNV-1a hash producing base-36 class name suffixes                |
| `keyframes`      | Function | Define `@keyframes` and return the animation name                |
| `sheet`          | Object   | Singleton `StyleSheet` instance for CSS injection                |
| `styled`         | Function | Create a styled component from an HTML tag                       |
| `styledElements` | Proxy    | Shorthand for `styled('div')`, `styled('span')`, etc.            |
| `ThemeContext`   | Context  | Pyreon context for theme distribution                            |
| `useTheme`       | Function | Access the current theme value                                   |

## Types

| Type              | Description                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `Interpolation`   | Union of valid interpolation types: `string \| number \| boolean \| null \| undefined \| InterpolationFn \| CSSResult` |
| `InterpolationFn` | `(props: Record<string, unknown>) => Interpolation`                                                                    |
| `StyledOptions`   | Options for `styled()`, including `shouldForwardProp`                                                                  |
| `StyleSheet`      | Type of the `sheet` singleton                                                                                          |
| `DefaultTheme`    | Augmentable interface for theme typing                                                                                 |
