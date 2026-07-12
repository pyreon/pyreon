# @pyreon/styler

Lightweight CSS-in-JS engine — `styled` / `css` / `keyframes` / theme, ~3.8KB gzipped.

`@pyreon/styler` is the CSS-in-JS layer that powers `@pyreon/rocketstyle`, `@pyreon/elements`, and every other rocketstyle-derived component. Singleton `StyleSheet` with FNV-1a class hashing and dedup cache. **Static templates resolve once at module load** (zero per-render cost); dynamic interpolations re-resolve on theme/prop change with class-cache dedup. `ThemeContext` is a **reactive** Pyreon context — whole-theme swaps (user-preference theme switching) propagate through the resolver effect in `styled()` and re-resolve CSS + swap class names WITHOUT remounting the VNode. SSR-isolated via `createSheet()`. CSS Nesting passes through to the browser unchanged.

## Install

```bash
bun add @pyreon/styler @pyreon/core @pyreon/reactivity
```

## Quick start

```tsx
import { styled, css, keyframes, createGlobalStyle, ThemeProvider } from '@pyreon/styler'

const Button = styled('button')`
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.primary};
  color: white;
  cursor: pointer;

  &:hover { opacity: 0.9; }
`

const GlobalStyle = createGlobalStyle`
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; font-family: ${({ theme }) => theme.font}; }
`

<ThemeProvider theme={{ colors: { primary: '#0d6efd' }, font: 'Inter, sans-serif' }}>
  <GlobalStyle />
  <Button>Click me</Button>
</ThemeProvider>
```

## API

### `styled(tag, options?)`

Creates a styled Pyreon component from an HTML tag, another component, or a styled component.

```ts
const Box = styled('div')`display: flex;`
const StyledLink = styled(Link)`color: blue;`
const Wider = styled(Box)`padding: 24px;`         // wrap an existing styled
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

```tsx
<Box as="section">Renders as a section</Box>
```

#### Transient props (`$`-prefixed)

```tsx
const Box = styled('div')`color: ${(p) => (p.$active ? 'blue' : 'gray')};`
<Box $active>$active is used for styling but does NOT reach the DOM.</Box>
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

Tagged template for composable CSS fragments — lazy `CSSResult`, resolved on use.

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

// Conditional fragments
const Box = styled('div')`
  display: flex;
  ${(props) => props.$bordered && css`
    border: 1px solid #e0e0e0;
    border-radius: 4px;
  `};
`
```

### `keyframes`

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

Global, non-scoped rules:

```ts
const GlobalStyle = createGlobalStyle`
  body { margin: 0; }
`
```

### `ThemeProvider` / `useTheme` / `useThemeAccessor`

`ThemeContext` is a Pyreon **reactive** context — whole-theme swaps (e.g. user preference dark→light) re-resolve every styled-component's CSS and swap classes in place, no VNode remount.

```tsx
import { ThemeProvider, useTheme, useThemeAccessor } from '@pyreon/styler'

<ThemeProvider theme={{ colors: { primary: '#0d6efd' } }}>
  <App />
</ThemeProvider>

// Inside a component:
const theme = useTheme()                  // snapshot at call time
const themeFn = useThemeAccessor()        // () => Theme — track inside effects/computeds
effect(() => console.log(themeFn().colors))
```

#### TypeScript theme augmentation

```ts
declare module '@pyreon/styler' {
  interface DefaultTheme {
    colors: { primary: string; text: string }
    spacing: (n: number) => string
  }
}
```

### `sheet` / `createSheet`

The singleton `sheet` manages CSS-rule injection. Use `createSheet()` for per-request SSR isolation:

```ts
import { sheet, createSheet } from '@pyreon/styler'

// SSR
const requestSheet = createSheet()
const html = renderToString(<App />)
const styleTags = requestSheet.getStyleTag()
requestSheet.reset()
```

#### CSP nonce (strict `style-src`)

Under a strict CSP (`style-src 'nonce-…'`, no `'unsafe-inline'`), the
SSR-inlined critical `<style>` needs a nonce or the browser blocks it on first
paint. Pass the per-request nonce to `getStyleTag(nonce)` — or set a default via
`createSheet({ nonce })`:

```ts
// per-request nonce (recommended — nonces rotate per response)
const tag = sheet.getStyleTag(res.locals.cspNonce)
// → <style data-pyreon-styler="" nonce="…">…</style>

// or a default nonce baked into an isolated sheet:
const requestSheet = createSheet({ nonce: res.locals.cspNonce })
```

The nonce also lands on the client `<style>` element created on mount. (Client
CSSOM `insertRule` mutations are CSP-exempt regardless — this covers only the
two inline-`<style>` surfaces.)

#### `@layer` support

```ts
const sheet = createSheet({ layer: 'components' })
// All scoped rules emitted inside @layer components { ... }
```

**@layer fallback (honest caveat).** When the engine has no `@layer` support
(happy-dom in tests, pre-2022 browsers), `insertGlobal` FLATTENS layer blocks
— `@layer x{…}` (named, anonymous, nested, and nested inside
`@media`/`@supports`/`@container`) unwraps to its inner rules so the content
still lands. This is a least-bad fallback, **not** an emulation: flattened
rules become *unlayered* (in a real `@layer` engine unlayered beats layered,
so they can now win specificity ties they were authored to lose), and
`@layer a, b;` ordering statements are meaningless once flattened — they are
dropped with a dev warning; rules fall back to plain source order. On
`@layer`-supporting engines everything (including ordering statements and
`@import` statements) inserts natively.

### `useCSS(cssResult)`

Read-only hook for retrieving the resolved class name of a `CSSResult` — useful for hand-managed JSX paths that need the class without `styled()`.

### Low-level

```ts
import {
  resolve, resolveValue, normalizeCSS, clearNormCache,
  hash, hashUpdate, hashFinalize, HASH_INIT,
  buildProps, filterProps, isDynamic,
} from '@pyreon/styler'
```

`buildProps` / `filterProps` are the prop-forwarding helpers `styled()` uses internally — exported for HOC authors who need to recreate the same filter contract.

## How it works

### Static path — zero runtime cost

Templates with no function interpolations resolve **once at module evaluation**. The CSS class, rules, and `<style>` element are pre-computed and cached.

### Dynamic path

Templates with function interpolations resolve on every render. A class-cache keyed by `($rocketstyle, $rocketstate)` (rocketstyle path) or by `$element` bundle identity (Element path) skips the resolver pipeline entirely on cache hits. Companion `injectRules(rules, key)` is the idempotent entry point the compile-time-collapse path uses to ship pre-resolved CSS without re-hashing.

### Reactive theme swaps

`ThemeProvider` wires the theme through `createReactiveContext` — `styled()` reads via the accessor inside a `renderEffect`, so flipping the provider's theme re-resolves CSS and patches `className` on the same node. No remount.

### CSS nesting passes through

Native CSS nesting is forwarded unchanged — `&:hover`, `&::before`, nested selectors, and `@media` queries work as-is in browsers that support native CSS Nesting.

**Browser baseline**: Chrome/Edge **112+** (Apr 2023), Safari **16.5+** (May 2023), Firefox **117+** (Aug 2023). For older targets, run the consumer build through PostCSS Nesting or Vite's lightningcss (which can flatten `&:hover` down to `.classname:hover` at build time) — the styler itself does not transform nesting selectors, so any consumer-side CSS post-processor that handles native nesting will work.

```ts
const Card = styled('div')`
  padding: 16px;
  &:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  & > h2 { margin: 0 0 8px; }
  @media (min-width: 768px) { padding: 24px; }
`
```

## Benchmarks

### Bundle size

| Library                 |     Minified |     Gzipped |
| ----------------------- | -----------: | ----------: |
| goober                  |      2.32 KB |     1.31 KB |
| **@pyreon/styler**      | **10.13 KB** | **3.81 KB** |
| styled-components       |     44.93 KB |    17.89 KB |
| @emotion/react + styled |     48.26 KB |    16.59 KB |

### Performance — CSS-in-JS engine hot paths (ops/sec, higher is better)

Reproducible cross-library micro-bench of the string-generation pipeline
(serialize → hash → dedup → SSR-collect), median of 30 windows + 95 % bootstrap
CI, `NODE_ENV=production`, correctness-gated. Reproduce:
`bun scripts/bench/core/styler.ts`.

| Operation                                     | **@pyreon/styler** |  @emotion/css |        goober | styled-components\* |
| --------------------------------------------- | -----------------: | ------------: | ------------: | ------------------: |
| Cold insert (100 unique rules / fresh sheet)  |         **~390 K** | ~185 K (2.1×) | ~164 K (2.4×) |                   — |
| Warm dedup (repeat identical CSS — cache hit) |         **~35 M**  | ~4.9 M (7.1×) | ~6.9 M (5.1×) |                   — |
| Dynamic resolve (fn/prop interpolation)       |         **~1.9 M** | ~360 K (5.3×) | ~890 K (2.2×) |                   — |
| SSR collect (100 rules → `<style>` string)    |         **~4.1 K** | ~1.8 K (2.3×) | ~1.6 K (2.5×) |       ~2.6 K (1.6×) |

(`N.N×` = how much slower than styler. Apple M3 Max / Bun-JSC; ratios are the
portable signal, absolute ops/s are machine-dependent.)

styler leads every operation: FNV-1a hashing + a raw-string `insertCache`
short-circuits warm re-renders (no re-serialize), and rule injection is **O(1)**
per rule (Map + buffer) so SSR critical-CSS collection stays flat as pages grow —
goober's string-append is O(n) and edges styler only on tiny pages (≲50 rules),
falling furthest behind at page scale.

\* **styled-components** appears in the SSR row only (via `ServerStyleSheet`) and
its number **includes a React `renderToStaticMarkup` pass** — it is a
component-model library, not a bare engine, so a per-call engine row would time
React, not the CSS work. **vanilla-extract** is intentionally absent: it is a
**zero-runtime, build-time** extractor (`.css.ts` → static stylesheet), a
different paradigm with no runtime resolve/insert to time. Author-judge
disclosed; this is a Node/JSC micro-bench (real-DOM `insertRule` cost is
browser-uniform and engine-dominated).

## Gotchas

- **Theme swaps re-resolve CSS but do NOT remount.** A whole-theme swap (`<ThemeProvider theme={B}>` → `<ThemeProvider theme={C}>`) updates the className in place. Identity preservation: pass a STABLE theme object via signal/computed if you want maximum cache reuse.
- **`useTheme()` returns a snapshot.** Inside effects/computeds, use `useThemeAccessor()` to subscribe to live updates.
- **`ThemeProvider` requires `nativeCompat` if used in a compat-layer app** — it's already marked. User code in compat-mode apps inheriting from `ThemeProvider` should preserve that contract.
- **`@layer` is opt-in**, not the default. The singleton `sheet` does not wrap in `@layer`.
- **Failed `insertRule` in production used to be silently swallowed.** Current code uses bare `process.env.NODE_ENV !== 'production'` — bundler-agnostic; do not regress to `import.meta.env.DEV` or `typeof process` guards.

## Documentation

Full docs: [pyreon.dev/docs/styler](https://pyreon.dev/docs/styler) (or `docs/src/content/docs/styler.md` in this repo).

## License

MIT
