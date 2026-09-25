---
title: Styler
description: CSS-in-JS engine for Pyreon with tagged templates, theming, keyframes, and SSR support.
---

`@pyreon/styler` is a lightweight CSS-in-JS library built for Pyreon. It provides a `styled` API using tagged template literals, a shared stylesheet with automatic deduplication, theming via context, and `@keyframes` support. It works on both client and server (SSR).

<PackageBadge name="@pyreon/styler" href="/docs/styler" />

## Browser Support

The styler emits CSS with **native CSS Nesting** (`&:hover`, `&::before`, nested selectors). Native nesting requires:

- **Chrome / Edge 112+** (April 2023)
- **Safari 16.5+** (May 2023)
- **Firefox 117+** (August 2023)

For older browser targets (legacy corporate IT, embedded WebViews, older mobile), run the consumer build through a CSS post-processor that flattens nesting at build time — Vite's [lightningcss](https://vitejs.dev/config/shared-options.html#css-transformer) or PostCSS with [postcss-nesting](https://github.com/csstools/postcss-nesting) both flatten `&:hover` → `.classname:hover` correctly. The styler itself does not transform nesting selectors, so any consumer-side processor that handles native nesting works.

## Installation

:::code-group

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

<Example file="./examples/styler/dynamic-styling" title="Dynamic Styling" />

## `css` Tagged Template

The `css` function creates a lazy `CSSResult` from a tagged template literal. It does **not** inject styles immediately -- the result must be resolved before injection.

```ts
import { css } from '@pyreon/styler'

const baseStyles = css`
  font-size: 14px;
  line-height: 1.5;
`
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
  color: ${(props) => (props.active ? 'blue' : 'gray')};
  opacity: ${(props) => (props.disabled ? 0.5 : 1)};
`
```

### Static Interpolations

String and number interpolations are static -- their value never depends on props, so it's fixed for the life of the `CSSResult`. When a `css` result made entirely of static interpolations is nested inside another `css`/`styled` template (`` ${resetStyles} ``), the resolved text is memoized on first use and reused on every subsequent resolve instead of being recomputed:

```ts
const color = 'red'
const size = 16
const styles = css`
  color: ${color};
  font-size: ${size}px;
`
```

### Nested CSS Results

You can compose `css` results by nesting them:

```ts
const resetStyles = css`
  margin: 0;
  padding: 0;
  box-sizing: border-box;
`

const cardStyles = css`
  ${resetStyles}
  border: 1px solid #ddd;
  border-radius: 8px;
`
```

### Conditional Styles

Use boolean/null returns for conditional inclusion:

```ts
const styles = css`
  display: flex;
  ${(props) => (props.centered ? 'align-items: center; justify-content: center;' : false)}
  ${(props) => (props.gap ? `gap: ${props.gap}px;` : null)}
`
```

### Multiple Interpolations

A single `css` template can contain any number of interpolations:

```ts
const styles = css`
  color: ${'red'};
  font-size: ${16}px;
  padding: ${8}px ${16}px;
`
```

### `CSSResult`

`CSSResult` holds the raw template strings and values — it is the (type-only)
type returned by `css`. Create one with the `css` tagged template, not `new`:

```ts
import { css, type CSSResult } from '@pyreon/styler'

const result: CSSResult = css`color: ${'red'};`
```

Properties:

- `strings: TemplateStringsArray | string[]` -- the static template parts
- `values: Interpolation[]` -- the interpolated values

### Resolving a `CSSResult` to a string

A `CSSResult` is lazy — call `.toString()` for the static form, or the exported
`resolve(strings, values, props)` to supply props for function interpolations.
(To get an injected **class name** instead of a raw string, use `useCSS(result, props)`.)

```ts
// @check
import { css } from '@pyreon/styler'

const result = css`
  color: red;
  font-size: 14px;
`
const cssString: string = result.toString()
// => "\n  color: red;\n  font-size: 14px;\n" — the RAW interpolated text,
// whitespace and all. `.toString()` / `resolve()` do NOT normalize.
```

With dynamic props:

```ts
import { resolve } from '@pyreon/styler'

const dynamicResult = css`
  color: ${(props: { color: string }) => props.color};
`
const cssString2 = resolve(dynamicResult.strings, dynamicResult.values, { color: 'blue' })
// => "\n  color: blue;\n"
```

`.toString()` / `resolve()` are intentionally the raw, un-normalized form — they're the primitive the rest of the package builds on. Every consumer that actually inserts CSS (`styled()`, `createGlobalStyle`, `keyframes`, `useCSS`) additionally passes the result through `normalizeCSS()` before hashing/inserting it, which is where comment-stripping and whitespace-collapsing happen (see [CSS Normalization](#css-normalization) below):

```ts
// @check
import { normalizeCSS, resolve } from '@pyreon/styler'

const raw = resolve([`\n  color: red;\n  /* note */ font-size: 14px;\n`] as unknown as TemplateStringsArray, [], {})
const normalized: string = normalizeCSS(raw)
// => "color: red; font-size: 14px;"
```

## `styled(tag, options?)`

Creates a styled Pyreon component. Returns a tagged template function that produces a `ComponentFn`.

```ts
import { styled } from '@pyreon/styler'

const Card = styled('div')`
  padding: 16px;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`
```

The two-step API: `styled(tag)` returns a tagged template function, and calling that with a template literal returns the component.

### Static CSS (Fast Path)

When all interpolations are static (no functions), the CSS class is computed once at component creation time and reused for every render. This is the fast path -- no per-render work is needed.

```ts
const StaticBox = styled('div')`
  display: flex;
  padding: 16px;
  background: #f5f5f5;
`
// Class computed once, reused on every render
```

Static interpolations (strings and numbers) also use the fast path:

```ts
const color = 'royalblue'
const padding = 12

const StaticButton = styled('button')`
  color: ${color};
  padding: ${padding}px;
`
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

The default forwarding set includes (~180 keys total, see `HTML_PROPS_LIST` in `forward.ts` for the exhaustive list):

- Standard attributes: `id`, `class`/`className`, `style`, `title`, `role`, `tabIndex`, `href`, `src`, `alt`, `type`, `name`, `value`, `checked`, `disabled`, `readOnly`, `placeholder`, `for`/`htmlFor`, `action`, `method`, `target`, `rel`, `width`, `height`, `min`, `max`, `step`, `pattern`, `required`, `autoFocus`, `hidden`, `draggable`, `contentEditable`, `loading`, `dangerouslySetInnerHTML`, `ref`, `key`, and more
- Event handlers: any prop starting with `on` **that appears in the allowlist** (e.g., `onClick`, `onMouseEnter`, `onInput`) — an unrecognized `on*` prop is still filtered out unless it's in `HTML_PROPS_LIST`
- Data attributes: any prop starting with `data-`
- ARIA attributes: any prop starting with `aria-`

`children` is **not** part of this list — component children are extracted from `props.children` and passed through separately (as the element's rendered children), never as a spread-in prop, so they always reach the element regardless of `shouldForwardProp`.

Override this behavior with the `shouldForwardProp` option:

```ts
const Box = styled('div', {
  shouldForwardProp: (prop) => prop !== 'spacing',
})`
  padding: ${props => props.spacing}px;
`

// 'spacing' is used for styles but not forwarded to the DOM
<Box spacing={16} id="my-box" />
// Renders: <div id="my-box" class="pyr-...">
```

Block all prop forwarding:

```ts
const PureStyled = styled('div', {
  shouldForwardProp: () => false,
})`
  display: flex;
`
// Only class is set, no other props forwarded
```

### `layer` — CSS `@layer` wrapping

`styled(tag, { layer })` wraps every rule this component generates in `@layer <name> { ... }`. This is how the framework's own UI layers avoid specificity wars: `@pyreon/elements` inserts its base layout rules under `layer: 'elements'`, and `@pyreon/rocketstyle` inserts theme rules under `layer: 'rocketstyle'` — the framework declares the cascade order once (`@layer elements, rocketstyle;`), so a rocketstyle theme rule always beats an Elements base rule regardless of source order or selector specificity.

```ts
const Panel = styled('div', { layer: 'app-base' })`
  padding: 16px;
`
// Emits: @layer app-base { .pyr-xyz { padding: 16px; } }
```

`insertLayer` on `sheet.insert()` is the lower-level per-call equivalent (see below). The sheet feature-detects `@layer` support once, when it first mounts its `<style>` element (by attempting to insert an `@layer` ordering rule and catching the failure): on the **client**, if that probe fails (e.g. a very old browser, or happy-dom in tests), every later `layer` wrapper is omitted entirely and rules are inserted un-layered — an unsupported `@layer` block would otherwise have its whole body dropped by the parser, which is worse than no layering. On the **server** the `@layer` wrapper is always emitted (SSR output is served to real, `@layer`-capable browsers). See [`sheet.insertGlobal(css)`](#sheetinsertglobalcss) for the equivalent fallback in the global-CSS path.

### Class Merging

Styled components merge user-provided `class` or `className` props with the generated class name:

```ts
const Box = styled('div')`display: flex;`

<Box class="custom-class" />
// class="pyr-abc123 custom-class"

<Box class="react-style" />
// class="pyr-abc123 react-style"
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
const NoStyles = styled('div')``
// Renders <div> with no class attribute

const WhitespaceOnly = styled('div')``
// Same — no class generated
```

## `styled.<tag>` Proxy shorthand

A convenience proxy for common HTML tags. Instead of `styled('div')`, write `s.div`:

```ts
import { styled as s } from '@pyreon/styler'

const Title = s.h1`
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 16px;
`

const Subtitle = s.h2`
  font-size: 18px;
  font-weight: 500;
  color: #666;
`

const Link = s.a`
  color: royalblue;
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`

const Container = s.section`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 16px;
`

const Input = s.input`
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
`

const Button = s.button`
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
`
```

This is equivalent to calling `styled('h1')`, `styled('a')`, `styled('section')`, etc. Any valid HTML tag name works.

## `keyframes`

Define CSS `@keyframes` animations. Returns the generated animation name that you can use in style rules.

```ts
import { keyframes, styled } from '@pyreon/styler'

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`

const Spinner = styled('div')`
  width: 24px;
  height: 24px;
  border: 2px solid #ccc;
  border-top-color: royalblue;
  border-radius: 50%;
  animation: ${spin} 1s linear infinite;
`
```

The returned string is a unique animation name (e.g., `pyr-kf-abc123`) generated from an FNV-1a hash of the keyframes CSS. The `@keyframes` rule is injected into the stylesheet immediately.

### Fade In/Out

```ts
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
`

const fadeOut = keyframes`
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(10px); }
`

const FadeInBox = styled('div')`
  animation: ${fadeIn} 0.3s ease-out forwards;
`
```

### Pulse

```ts
const pulse = keyframes`
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
`

const PulseButton = styled('button')`
  animation: ${pulse} 2s ease-in-out infinite;
  padding: 12px 24px;
  background: royalblue;
  color: white;
  border: none;
  border-radius: 4px;
`
```

### Slide In

```ts
const slideInFromLeft = keyframes`
  from { transform: translateX(-100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
`

const slideInFromRight = keyframes`
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
`

const SlidePanel = styled('div')`
  animation: ${(props) => (props.direction === 'left' ? slideInFromLeft : slideInFromRight)} 0.4s
    ease-out;
`
```

### Skeleton Loading

```ts
const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`

const Skeleton = styled('div')`
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: ${shimmer} 1.5s ease-in-out infinite;
  border-radius: 4px;
  height: ${(props) => props.height || '20px'};
  width: ${(props) => props.width || '100%'};
`
```

## `createGlobalStyle`

Injects **unscoped** CSS — not wrapped in a generated class selector — for resets, `@font-face`, `:root` custom properties, and other document-level rules. It returns a `ComponentFn` you mount once, typically near the app root.

```tsx
import { createGlobalStyle } from '@pyreon/styler'

const GlobalStyle = createGlobalStyle`
  *, *::before, *::after {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    font-family: system-ui, sans-serif;
  }

  :root {
    --primary: royalblue;
  }
`

// Mount once, anywhere in the tree — it renders no DOM (always returns null).
function App() {
  return (
    <>
      <GlobalStyle />
      <MainContent />
    </>
  )
}
```

Like `styled()`, `createGlobalStyle` has a static fast path (CSS injected once, immediately, at creation time when there are no function interpolations) and a dynamic path (re-resolved on every render when an interpolation is a function, reading `theme` via `useTheme()`):

```tsx
const ThemedGlobalStyle = createGlobalStyle`
  body {
    background: ${(props) => props.theme?.colors?.background ?? '#fff'};
  }
`
```

The rendered component always returns `null` — `createGlobalStyle` exists purely for its injection side effect, so mount it once (mounting it multiple times re-injects the same rules, which the sheet's content-hash dedup makes a no-op).

## `sheet` (StyleSheet)

The singleton stylesheet manager that handles all CSS injection. You rarely need to interact with it directly, but it is available for advanced use cases.

### How It Works

The `StyleSheet` class maintains:

- A **cache** (`Map<string, string>`) that maps CSS strings to generated class names for deduplication
- A **`<style>` element** (client-side) injected into `document.head` with a `data-pyreon-styler` attribute
- An **SSR rules buffer** (server-side) that collects rules as strings

The sheet automatically detects whether it is running in a browser or server environment via `typeof document === 'undefined'`.

### `sheet.insert(cssText, _unused?, insertLayer?)`

Inserts a CSS rule and returns the generated class name. Rules are deduplicated -- inserting the same CSS text (and the same `insertLayer`) twice returns the same class name without creating a duplicate rule.

```ts
import { sheet } from '@pyreon/styler'

const className = sheet.insert('color: red; font-size: 14px;')
// => "pyr-abc123"

// Same CSS returns same class (deduplication)
const same = sheet.insert('color: red; font-size: 14px;')
// same === className

// Optional third argument wraps the rule in `@layer <name> { ... }`
const layered = sheet.insert('color: blue;', undefined, 'app-base')
```

The second positional parameter is reserved (historically `boost`) and does nothing today — always pass `undefined` or omit it, and use the third `insertLayer` argument (or `layer` in `StyledOptions`/`StyleSheetOptions`) if you need cascade control.

The generated class name has the format `pyr-&#123;hash&#125;` where the hash is a base-36 FNV-1a hash of the CSS string.

### Cache Eviction

The sheet maintains a maximum cache size of 10,000 entries. When the cache exceeds this limit, the oldest 10% of entries are evicted. This prevents unbounded memory growth in long-running applications with highly dynamic styles.

### `sheet.insertKeyframes(name, body)`

Inserts a `@keyframes` rule under the given `name` and returns `void` — unlike `sheet.insert()`, it does **not** generate the name for you; the caller (the `keyframes` tagged template) computes it first via `hash(body)` and passes it in. Deduplicated by `name`: calling it again with the same name is a no-op regardless of `body`.

```ts
import { hash, sheet } from '@pyreon/styler'

const body = 'from { opacity: 0; } to { opacity: 1; }'
const animName = `pyr-kf-${hash(body)}`
sheet.insertKeyframes(animName, body)
// Injects: @keyframes pyr-kf-<hash> { from { opacity: 0; } to { opacity: 1; } }
```

In practice you rarely call this directly — use the `keyframes` tagged template above, which does exactly this and returns the resulting animation name as a `KeyframesResult` (stringifies to the name).

### `sheet.insertGlobal(css)`

Inserts a global (unscoped) CSS rule. The rule is not wrapped in a class selector.

```ts
sheet.insertGlobal('body { margin: 0; font-family: system-ui; }')
sheet.insertGlobal('*, *::before, *::after { box-sizing: border-box; }')
sheet.insertGlobal(':root { --primary: royalblue; --text: #333; }')
```

Multi-rule input is split string/comment/`url()`-aware (braces inside quoted
strings, comments, or unquoted `url(…)` tokens never split a rule), and
semicolon-terminated at-statements (`@layer a, b;`, `@import …;`,
`@namespace …;`) are inserted as their own rules.

**@layer fallback.** On engines without `@layer` support (happy-dom in
tests, pre-2022 browsers), `insertGlobal` flattens `@layer` blocks — named,
anonymous, nested, and nested inside `@media`/`@supports`/`@container` — to
their inner rules so the content still lands. This changes cascade
semantics; it is not an emulation: flattened rules become unlayered (they
can now win specificity ties they were authored to lose, since unlayered
beats layered in a real `@layer` engine), and `@layer a, b;` ordering
statements are dropped with a dev warning — rules fall back to plain source
order. Apps that must reproduce layer-order inversions in pre-`@layer`
browsers need a specificity/source-order strategy instead.

### `sheet.getStyleTag(nonce?)`

Returns all accumulated rules as a `<style>` tag string for server-side rendering. Returns an empty (still-tagged) `<style>` if no rules have been inserted. Any literal `</style` sequence inside the accumulated CSS is escaped (`<\/style`) so a value that happens to contain it can't prematurely close the tag.

```ts
const html = sheet.getStyleTag()
// => '<style data-pyreon-styler="">.pyr-abc123{color:red;font-size:14px;}@keyframes pyr-kf-xyz{...}</style>'
```

#### CSP nonce (strict `style-src`)

Under a strict Content-Security-Policy (`style-src 'nonce-…'`, no `'unsafe-inline'`), the SSR-inlined critical `<style>` needs a nonce or the browser blocks it on first paint. Pass the per-request nonce — it also lands on the client `<style>` element on mount:

```ts
const html = sheet.getStyleTag(req.cspNonce)
// => '<style data-pyreon-styler nonce="…">…</style>'

// or bake a default into an isolated per-request sheet:
const requestSheet = createSheet({ nonce: req.cspNonce })
```

(Client-side CSSOM `insertRule` is CSP-exempt regardless, so this only matters for the SSR-inlined `<style>` and the initial client `<style>` element.)

### `sheet.reset()`

Clears the dedup cache Maps and the SSR rules buffer. It does **not** remove any CSS rule already injected into a live `<style>` element on the client, nor the element itself — it's meant for the **server**, called between requests so a request's `getStyleTag()` only reflects rules inserted during that request:

```ts
import { sheet } from '@pyreon/styler'

async function handleRequest(req, res) {
  sheet.reset() // clear per-request accumulation before rendering
  const html = await renderToString(<App />)
  const styles = sheet.getStyleTag()
  res.send(`<html><head>${styles}</head><body>${html}</body></html>`)
}
```

### `sheet.clearAll()` — full reset (client / HMR)

Clears the same caches as `reset()` **and** deletes every live CSS rule from the mounted `<style>` element's `sheet.cssRules` (the `<style>` tag itself stays in the DOM, just emptied), and notifies internal subscribers so downstream component caches (e.g. `styled()`'s per-source-location component cache) invalidate too. This is what you want on the client for a full teardown — e.g. dev-time hot reload:

```ts
sheet.clearAll()
// Every styled() component created before this call now produces a FRESH
// class the next time it's used, and any stale CSS rules are gone from the DOM.
```

:::tip{title="Which one in `afterEach`?"}
For test isolation, `sheet.reset()` (clear caches only) is enough in most vitest suites — a fresh happy-dom/jsdom document per test file means there's no persistent `<style>` element to worry about, and the package's own tests use it for the common case. Reach for `sheet.clearAll()` when the test actually asserts on live CSS rules in the DOM across multiple `it()` blocks sharing one document (real-Chromium browser tests, or any suite that reuses a single mounted `<style>` element) — it's the only one of the two that empties `sheet.cssRules`.
:::

### Other `sheet` methods

- **`sheet.has(className)`** — `true` if `className` is already in the dedup cache (O(1)).
- **`sheet.getStyleRules()`** — the raw array of accumulated SSR rule strings (advanced; most consumers want `getStyleTag()`).
- **`sheet.cacheSize`** — number of distinct CSS rules currently cached (getter).
- **`sheet.clearCache()`** — clears the dedup caches (including the `normalizeCSS` cache) without touching live DOM rules or the SSR request state; a middle ground between `reset()` and `clearAll()`, rarely needed directly.

## SSR (Server-Side Rendering)

On the server (`typeof document === 'undefined'`), the sheet collects rules in an in-memory buffer instead of injecting into a DOM `<style>` element.

### Basic SSR Flow

```ts
import { styled, sheet } from '@pyreon/styler'

// 1. Render your components (this inserts rules into the sheet)
const Button = styled('button')`
  background: royalblue;
  color: white;
  padding: 8px 16px;
`

// ... render your component tree ...

// 2. Collect the generated styles (AFTER rendering — getStyleTag() only
//    returns rules already inserted into the sheet)
const styleTag = sheet.getStyleTag()
// '<style data-pyreon-styler="">.pyr-abc{background:royalblue;color:white;padding:8px 16px;}</style>'

// 3. Inject into your HTML template
const html = `
  <!DOCTYPE html>
  <html>
    <head>${styleTag}</head>
    <body>${renderedApp}</body>
  </html>
`

// 4. Reset for the next request
sheet.reset()
```

### Per-Request Isolation

For server environments handling multiple requests, reset the sheet between requests to prevent style leakage:

```ts
async function handleRequest(req, res) {
  sheet.reset()

  // Render FIRST — this is what populates the sheet's SSR buffer.
  const html = await renderToString(<App />)
  // THEN collect styles — getStyleTag() only returns rules already inserted.
  const styles = sheet.getStyleTag()

  res.send(`<html><head>${styles}</head><body>${html}</body></html>`)
}
```

## `hash(str)`

FNV-1a hash function that produces compact base-36 strings. Used internally for class name and animation name generation.

```ts
// @check
import { hash } from '@pyreon/styler'

const a: string = hash('color: red;') // => "1pvnhim"
const b: string = hash('display: flex;') // => "1gsnvr5"
```

The hash uses the standard FNV-1a algorithm with offset basis `2166136261` (`HASH_INIT`) and prime `16777619`, then converts to base-36 for compact string representation. `hashUpdate(init, str)` / `hashFinalize(h)` expose the streaming form — `hashFinalize(hashUpdate(hashUpdate(HASH_INIT, 'ab'), 'cd'))` produces the same result as `hash('abcd')`, useful for hashing a value incrementally without concatenating it first.

### Deterministic Output

The hash is deterministic -- the same input always produces the same output. This means:

- The same CSS always gets the same class name
- SSR and client hydration produce matching class names
- No runtime randomness or counters

## Theming

### Providing a theme: `provide(ThemeContext, ...)`

`ThemeContext` is a plain Pyreon `Context` object (`{ id, defaultValue }`) — **it has no `.Provider` component**, unlike React's context API. To provide a value for the current component's subtree, call `provide(ctx, value)` (from `@pyreon/core`) inside a component body:

```ts
import { ThemeContext } from '@pyreon/styler'
import { provide } from '@pyreon/core'

const theme = {
  colors: { primary: 'royalblue', text: '#333', background: '#fff' },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radii: { sm: 4, md: 8, lg: 16, full: 9999 },
  fonts: { body: 'system-ui, sans-serif', mono: 'ui-monospace, monospace' },
}

function AppRoot(props) {
  // ThemeContext is a ReactiveContext<Theme> — it expects an ACCESSOR
  // (() => Theme), not the raw theme object.
  provide(ThemeContext, () => theme)
  return props.children
}
```

**In a real app, don't provide `ThemeContext` directly** — use `<PyreonUI theme={theme} mode="light">` from `@pyreon/ui-core` instead. `PyreonUI` provides `ThemeContext` (among other context layers), enriches the theme with responsive-breakpoint helpers, and wires the `theme` prop to update reactively when it changes. See the [styling and theming pattern](/docs/patterns/styler-theming) for the full picture. The styler package also ships a low-level, deprecated `ThemeProvider` component (`import { ThemeProvider } from '@pyreon/styler'`) equivalent to the `provide()` call above — it exists for backward compatibility and internal use; prefer `PyreonUI`.

### Accessing the Theme

Use `useTheme()` inside any component within the provider tree — it reads the current theme value:

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

### `useTheme()` vs `useThemeAccessor()`

`ThemeContext` is a **reactive** context (`createReactiveContext`) — the value flowing through it is an accessor `() => Theme`, not the theme itself.

- **`useTheme()`** calls the accessor and returns the resolved `Theme` **once**, at the moment you call it. Use it for one-shot reads in component-setup code (signal-init values, computing a default from a theme token). Calling it does **not** create a reactive subscription — if `useTheme()` is called at component setup (outside an `effect`/`computed`/JSX accessor), a later theme swap will not re-run that code.
- **`useThemeAccessor()`** returns the raw `() => Theme` function itself, unresolved. Call the returned accessor *inside* a tracking scope (`effect()`, `computed()`, or a JSX accessor `{() => ...}`) to subscribe to theme changes — every time the provided theme changes, the tracking scope re-runs and re-reads the new value.

```ts
import { useThemeAccessor } from '@pyreon/styler'

function LiveThemedText(props) {
  const getTheme = useThemeAccessor()
  // Reactive: the WHOLE `style` value is the accessor (not a function nested
  // inside a plain object) — the runtime wraps a function-valued prop in a
  // renderEffect and re-reads it on every theme change, producing a fresh
  // plain object each run.
  return <span style={() => ({ color: getTheme().colors.text })}>{props.children}</span>
}
```

:::warning{title="Plain `styled()` components resolve their theme-derived CSS ONCE per mount"}
Components run once in Pyreon, and a `styled()` component's dynamic-path CSS class is normally computed a single time at mount from whatever `useTheme()`-equivalent snapshot was current then — a later theme swap does **not** automatically re-resolve it, and there is no per-component `effect()` watching the theme.

The one exception: when a `styled()` component is driven through `@pyreon/rocketstyle` or `@pyreon/elements` — which pass their own dimension/props objects as reactive **function accessors** (`$rocketstyle`, `$element`) — styler wraps the CSS resolution in a `computed()` that also tracks the theme accessor, so theme (and mode/dimension) changes DO re-resolve the class and swap it on the live element without remounting. This is what `<PyreonUI>` + rocketstyle-based UI components (`@pyreon/ui-components`) rely on for live light/dark switching.

For a hand-written `styled()` component to pick up a live theme swap, remount its subtree — e.g. put it behind a reactive `<Show>`/JSX accessor keyed on the value that changed (see the [Dark Mode Example](#dark-mode-example) below), or wrap it with rocketstyle.
:::

### Theme with Styled Components

Access the theme inside styled component interpolations via `useTheme()` in the parent component, or structure your app so theme values are passed as props:

```ts
const PrimaryButton = styled('button')`
  background: ${(props) => props.theme?.colors?.primary || 'royalblue'};
  color: white;
  padding: ${(props) => props.theme?.spacing?.sm || 8}px
    ${(props) => props.theme?.spacing?.md || 16}px;
  border: none;
  border-radius: ${(props) => props.theme?.radii?.sm || 4}px;
  cursor: pointer;
  font-family: ${(props) => props.theme?.fonts?.body || 'system-ui'};
`
```

### TypeScript Theme Augmentation

Extend the `DefaultTheme` interface with module augmentation to get full type safety across your application:

```ts
// types/theme.d.ts
declare module '@pyreon/styler' {
  interface DefaultTheme {
    colors: {
      primary: string
      secondary: string
      success: string
      danger: string
      text: string
      background: string
    }
    spacing: {
      xs: number
      sm: number
      md: number
      lg: number
      xl: number
    }
    radii: {
      sm: number
      md: number
      lg: number
      full: number
    }
    fonts: {
      body: string
      mono: string
    }
  }
}
```

After augmentation, `useTheme()` returns a fully typed theme object:

```ts
const theme = useTheme()
theme.colors.primary // string -- type-safe
theme.spacing.md // number -- type-safe
theme.colors.invalid // TypeScript error
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

  // Provide a REACTIVE accessor once, at setup — descendants that read it
  // inside a tracked scope (useThemeAccessor(), or a rocketstyle/elements-
  // driven styled() component) see the swap live without a remount.
  provide(ThemeContext, () => (isDark() ? darkTheme : lightTheme))

  return (
    <div>
      <button onClick={() => isDark.set(!isDark())}>Toggle theme</button>
      <MainContent />
    </div>
  )
}
```

## Nested Selectors and Pseudo-Classes

CSS in styled components supports standard CSS selectors including pseudo-classes and pseudo-elements. Because styles are scoped to a generated class, you can use nested patterns freely:

```ts
const InteractiveButton = styled('button')`
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
`
```

## Media Queries

Use standard CSS media queries inside styled components:

```ts
const ResponsiveGrid = styled('div')`
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
`

const ResponsiveText = styled('p')`
  font-size: 14px;
  line-height: 1.5;

  @media (min-width: 768px) {
    font-size: 16px;
    line-height: 1.6;
  }

  @media (min-width: 1024px) {
    font-size: 18px;
  }
`
```

## Real-World Component Examples

### Button with Variants

```ts
import { styled as s, keyframes } from '@pyreon/styler'
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
const Input = styled('input')`
  display: block;
  width: 100%;
  padding: 8px 12px;
  font-size: 14px;
  line-height: 1.5;
  color: #333;
  background: white;
  border: 1px solid ${(props) => (props.error ? '#dc3545' : '#ccc')};
  border-radius: 4px;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;

  &::placeholder {
    color: #999;
  }

  &:focus {
    outline: none;
    border-color: ${(props) => (props.error ? '#dc3545' : 'royalblue')};
    box-shadow: 0 0 0 3px
      ${(props) => (props.error ? 'rgba(220, 53, 69, 0.25)' : 'rgba(65, 105, 225, 0.25)')};
  }

  &:disabled {
    background: #f5f5f5;
    cursor: not-allowed;
  }
`

const Label = styled('label')`
  display: block;
  margin-bottom: 4px;
  font-size: 14px;
  font-weight: 500;
  color: ${(props) => (props.error ? '#dc3545' : '#333')};
`

const ErrorMessage = styled('span')`
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #dc3545;
`
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
const Button = styled('button')`
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  background: ${(props) => (props.primary ? 'royalblue' : '#e2e2e2')};
`

// More optimal: use a static base and compose styles via class
const baseButton = css`
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
`

// Dynamic part is kept minimal
const DynamicButton = styled('button')`
  ${baseButton}
  background: ${(props) => (props.primary ? 'royalblue' : '#e2e2e2')};
`
```

Since the sheet deduplicates by CSS content, identical CSS strings always resolve to the same class. This means you pay zero cost for repeated identical insertions.

## CSS Normalization

Every caller that resolves a template (`styled()`, `createGlobalStyle`, `keyframes`, `useCSS`) passes the raw `resolve(...)` output through `normalizeCSS()` before hashing/inserting it. `resolve()` itself does not normalize — call it directly (e.g. via `CSSResult.toString()`) and you get the raw interpolated text, comments and all. `normalizeCSS` is a single-pass, memoized (`Map<string, string>`) scanner that:

- Strips **block comments** (`/* ... */`)
- Strips **line comments** (`//`), but preserves `://` inside URLs
- Collapses **newlines, tabs, carriage returns** to single spaces
- Collapses **consecutive spaces** to a single space
- Trims **leading and trailing whitespace**
- Drops redundant semicolons (e.g. after `{`, `}`, or another `;`)

This ensures consistent hashing regardless of how the template is formatted — two templates differing only in whitespace/comments/formatting resolve to the same class name. `clearNormCache()` clears the memoization (used during HMR).

## Advanced: `useCSS`, `buildProps`, `filterProps`

These lower-level exports are what `styled()` itself is built on. Reach for them only when `styled()` doesn't fit — e.g. attaching computed styles to a plain element without a dedicated component, or building your own styled-like wrapper.

### `useCSS(cssResult, props?, boost?)`

Resolves a `css` template with the given props (merged with the current theme) and returns the generated class name — no component wrapper needed:

```tsx
import { css, useCSS } from '@pyreon/styler'

const highlighted = css`
  background: ${(p) => (p.active ? 'yellow' : 'transparent')};
`

function Row(props) {
  const cls = useCSS(highlighted, { active: props.selected })
  return <li class={cls}>{props.children}</li>
}
```

`useCSS` reads `useTheme()` internally and merges it into the props object passed to the template's interpolation functions — it is **not** reactive on its own (same one-shot-per-call caveat as `useTheme()`); call it inside a reactive scope if you need it to re-resolve on prop/theme change.

### `buildProps` and `filterProps`

`filterProps(props)` returns a new object containing only the props styler would forward to a DOM element (HTML attributes, `data-*`, `aria-*` — the same allowlist `styled()` uses internally), stripping `$`-prefixed transient props and anything unrecognized. `buildProps(rawProps, generatedClassName, isDOM, customFilter?)` does the same filtering **plus** merges in a generated class name and wires up `ref` — it's the single-pass helper `styled()`'s render functions call internally. Both preserve getter-shaped reactive props (they copy property *descriptors*, not resolved values) so wrapping them around a signal-driven prop doesn't freeze it.

```ts
import { filterProps } from '@pyreon/styler'

function PassthroughDiv(props) {
  return <div {...filterProps(props)}>{props.children}</div>
  // $variant, $size, etc. are stripped; id/class/onClick/data-*/aria-* pass through
}
```

## Common Mistakes

- **Reaching for `<ThemeContext.Provider value={...}>`.** `ThemeContext` is a plain Pyreon `Context` object, not a React-style context — there is no `.Provider` component. Use `provide(ThemeContext, () => theme)` (from `@pyreon/core`), or, in a real app, `<PyreonUI theme={theme}>` from `@pyreon/ui-core`. See [Theming](#theming) above.
- **Expecting a live theme swap to re-color an already-mounted, hand-written `styled()` component.** It won't — see the caution box under [Theming](#theming). Only rocketstyle/`@pyreon/elements`-driven components (which pass their dimension props as reactive accessors) get automatic re-resolution; a plain `styled()` component's CSS is fixed once it mounts.
- **Passing a second argument to `sheet.insert(cssText, boost)` expecting a specificity boost.** That parameter is a reserved no-op (`_unused`) kept only for call-site backward compatibility — it does nothing. Use the `layer` option (on `styled()` or as `sheet.insert()`'s third argument) if you need one rule to reliably beat another; see [`layer` — CSS `@layer` wrapping](#layer-css-layer-wrapping).
- **Calling `sheet.reset()` on the client expecting it to remove already-injected CSS.** It only clears the internal dedup caches — any rule already in the live `<style>` element's `sheet.cssRules` stays there. `reset()` is for server request boundaries; use `sheet.clearAll()` on the client (e.g. for a full HMR-style wipe).
- **Getting silently-wrong CSS from a theme-token expression and not noticing.** In development, every resolved CSS string is scanned for common footguns before insertion — a `NaN` (JS arithmetic on a CSS-variable token, e.g. `${(t) => t.spacing.sm * 2}` where `spacing.sm` is a `var(--...)` string), an `undefined`/`null` value (a theme-token path that doesn't exist), a malformed `var(--x)concat` (string concatenation instead of `calc()`/`color-mix()`), or `content-visibility: auto` without `contain-intrinsic-size` (a Cumulative Layout Shift footgun) all print a `[Pyreon] styler: ...` console warning naming the exact declaration. Watch for these when styles silently don't apply.
- **Assuming `styled()`'s `on*` forwarding is a wildcard.** It's a fixed allowlist of ~40 specific handler names (`onClick`, `onInput`, `onMouseEnter`, ...), not "any prop starting with `on`" — an unrecognized custom `onXyz` prop is filtered out just like any other unknown prop. Use `shouldForwardProp` to allow it through.
- **Augmenting `DefaultTheme` in your own app when a theme package (e.g. `@pyreon/ui-theme`) already does.** Two `declare module '@pyreon/styler' { interface DefaultTheme {...} }` blocks for different shapes fail with `TS2320` ("cannot simultaneously extend"). Only augment it once.

## API Reference

Every runtime export from `@pyreon/styler`'s `index.ts` (type-only exports are listed separately under [Types](#types)):

| Export             | Type     | Description                                                                 |
| ------------------ | -------- | ---------------------------------------------------------------------------- |
| `css`               | Function | Tagged template for lazy CSS representation                                  |
| `resolve`           | Function | Resolves template strings + values (+ props) into a CSS string               |
| `resolveValue`      | Function | Resolves a single `Interpolation` value (used internally by `resolve`)       |
| `normalizeCSS`      | Function | Single-pass CSS normalizer (strip comments, collapse whitespace)             |
| `clearNormCache`    | Function | Clears the `normalizeCSS` memoization cache (HMR use)                        |
| `isDynamic`         | Function | `true` if an `Interpolation` value contains a function anywhere              |
| `hash`              | Function | FNV-1a hash producing base-36 class name suffixes                            |
| `hashUpdate`        | Function | Streaming FNV-1a — feed one string segment into a running hash state         |
| `hashFinalize`      | Function | Finalize a streaming hash state into the base-36 string                      |
| `HASH_INIT`         | Constant | FNV-1a offset basis, the starting state for `hashUpdate`                     |
| `keyframes`         | Function | Define `@keyframes` and return the animation name                            |
| `createGlobalStyle` | Function | Inject global (unscoped) CSS via a mounted component (always renders `null`) |
| `sheet`             | Object   | Singleton `StyleSheet` instance for CSS injection                            |
| `createSheet`       | Function | Isolated `StyleSheet` (per-request SSR, shadow DOM, CSP nonce)               |
| `styled`            | Function | Create a styled component; `styled.div` etc. via Proxy shorthand             |
| `defineTheme`       | Function | Identity helper for declaring theme tokens (typing + multiplatform hook)     |
| `ThemeContext`       | Context  | Reactive Pyreon context (`() => Theme`) for theme distribution               |
| `ThemeProvider`     | Component | `@deprecated` — low-level provider; prefer `<PyreonUI theme={...}>`         |
| `useTheme`          | Function | Read the current theme **once**, at call time                                |
| `useThemeAccessor`  | Function | Get the raw `() => Theme` accessor, for tracked reads inside reactive scopes |
| `useCSS`            | Function | Resolve a `css` template + props to an injected class name (no component)   |
| `buildProps`        | Function | Build final DOM/component props (class merge + ref + filtering) in one pass |
| `filterProps`       | Function | Filter a props object down to forwardable HTML/data/aria attributes         |

## Types

| Type                | Description                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `CSSResult`          | Lazy CSS result holding template strings and interpolated values (returned by `css`)                        |
| `Interpolation<P>`   | Union of valid interpolation types: `string \| number \| boolean \| null \| undefined \| CSSResult \| Interpolation<P>[] \| ((props: StyledProps<P>) => Interpolation<P>)` — the function form is not a separately-named export, just the last union member |
| `StyledOptions`      | Options for `styled()`: `shouldForwardProp?: (prop: string) => boolean` and `layer?: string`               |
| `StyledFunction`     | Type of the `styled` export itself (the callable + the `styled.<tag>` proxy properties)                     |
| `StyleSheet`         | Type of the `sheet` singleton / a `createSheet()` instance                                                  |
| `StyleSheetOptions`  | Options for `createSheet()`: `maxCacheSize?`, `layer?`, `nonce?`, `registerSSRFlush?`                        |
| `DefaultTheme`       | Augmentable (empty by default) interface for theme typing — augment via `declare module '@pyreon/styler'`  |
