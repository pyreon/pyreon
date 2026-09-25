---
title: "CSS-in-JS — API Reference"
description: "CSS-in-JS — styled() / css / keyframes / createGlobalStyle, reactive theming, FNV-1a-deduped StyleSheet (SSR-safe)"
---

# @pyreon/styler — API Reference

> **Generated** from `styler`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [styler](/docs/styler).

Pyreon's CSS-in-JS engine. `styled('div')` is a tagged template that returns a `ComponentFn` injecting a generated class; `css` is a tagged template returning a LAZY `CSSResult` resolved on use (not a string); `keyframes` returns the generated animation-name string. Tagged-template interpolations receive the component's `props` (and the theme) so styles can be signal-driven — function interpolations flip the component onto the dynamic resolve path (`isDynamic`). A singleton `StyleSheet` with FNV-1a hashing dedupes and supports SSR; `createSheet()` makes an isolated instance. Theme is delivered through a REACTIVE context — `useTheme()` snapshots at call time, `useThemeAccessor()` returns the raw `() => Theme` accessor for tracking inside effects so whole-theme swaps re-resolve without remounting.

## Multiplatform

**Tier:** Shared — the same source runs on web, iOS and Android

styled(Prim) + defineTheme tokens lower via the styler-native frontend; the CSS-in-JS runtime is web, the authored patterns compile

See [Multiplatform](/docs/multiplatform) for the capability matrix and [Multiplatform libraries](/docs/multiplatform-libraries) for every package's tier.

## Features

- styled('div')`...` / styled(Component)`...` / styled.div`...` (Proxy) — component factory with `as` polymorphism + $-transient props
- css`...` — lazy CSSResult, resolved on use (NOT a string)
- keyframes`...` — returns the generated @keyframes animation-name string
- createGlobalStyle`...` — returns a ComponentFn that injects global CSS when mounted
- useCSS(template, props?, boost?) — resolve a CSSResult to a class name inside a component
- Reactive theming — useTheme() snapshot vs useThemeAccessor() accessor; the theme is provided by &lt;PyreonUI&gt; (ThemeProvider is a low-level, non-merging fallback)
- Singleton StyleSheet (FNV-1a dedup, SSR) + createSheet() for isolated instances
- buildProps / filterProps — $-transient + shouldForwardProp DOM prop forwarding (descriptor-preserving)

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`defineTheme`](#definetheme) | function | Declare the app's design tokens. |
| [`styled`](#styled) | function | Component factory. |
| [`css`](#css) | function | Tagged-template that returns a LAZY `CSSResult` — it is NOT a class name or a CSS string until resolved by `styled()`, ` |
| [`keyframes`](#keyframes) | function | Tagged-template returning a `KeyframesResult` whose string form is the GENERATED, content-hashed `@keyframes` animation  |
| [`createGlobalStyle`](#createglobalstyle) | function | Returns a `ComponentFn` that injects GLOBAL CSS (resets, `:root` tokens, body styles) when MOUNTED — it is not a side-ef |
| [`useCSS`](#usecss) | hook | Resolves a `CSSResult` (from the `css` tagged template) to an injected class-name string inside a component. |
| [`useTheme`](#usetheme) | hook | Returns the current theme as a SNAPSHOT at call time. |
| [`useThemeAccessor`](#usethemeaccessor) | hook | Returns the raw `() => T` theme accessor (not a snapshot). |
| [`ThemeProvider`](#themeprovider) | component | Low-level provider for the reactive `ThemeContext` — marked `@internal` / `@deprecated` in source in favour of `&lt;PyreonU |
| [`ThemeContext`](#themecontext) | constant | The reactive context backing the theme. |
| [`createSheet`](#createsheet) | function | Creates an ISOLATED `StyleSheet` instance (its own FNV-1a dedup cache + rule registry) instead of the shared singleton ` |
| [`StyleSheet`](#stylesheet) | class | The CSS injection engine: FNV-1a content hashing, a dedup cache (identical CSS → one rule), and SSR support (collect rul |
| [`sheet`](#sheet) | constant | The process-wide singleton `StyleSheet` that `styled()` / `css` / `keyframes` / `createGlobalStyle` inject into by defau |
| [`resolve`](#resolve) | function | Low-level: resolve a tagged-template (strings + interpolations) against a `props` object into a final CSS string (functi |
| [`normalizeCSS`](#normalizecss) | function | Normalizes a raw CSS string (whitespace/format canonicalization) so identical-intent CSS hashes to the same FNV-1a key a |
| [`resolveValue`](#resolvevalue) | function | Resolves a SINGLE interpolation against `props`: invokes function interpolations with `props`, flattens nested `CSSResul |
| [`clearNormCache`](#clearnormcache) | function | Clears the `normalizeCSS` memo cache. |
| [`buildProps`](#buildprops) | function | Builds the final prop object forwarded to the rendered element: merges the generated class, drops `$`-transient props, a |
| [`filterProps`](#filterprops) | function | Returns a copy of `props` keeping ONLY known HTML attributes plus `data-*` / `aria-*` (an allowlist, not a denylist); `$ |
| [`isDynamic`](#isdynamic) | function | True when an interpolation is a function (signal accessor / props reader) — i.e. |
| [`hash / hashUpdate / hashFinalize / HASH_INIT`](#hash-hashupdate-hashfinalize-hash-init) | function | The FNV-1a non-cryptographic hash styler uses for compact, deduped class names + rule keys. |
| [`setStyleExtraction`](#setstyleextraction) | function | Internal dependency-injection seam for Custom-Property Style Extraction (CPSE). |

## API

### defineTheme `function`

```ts
defineTheme<T extends object>(theme: T): T
```

Declare the app's design tokens. On the web this is a TYPED IDENTITY helper — it returns the object unchanged for passing to `<PyreonUI theme={…}>`. Its real weight is MULTIPLATFORM: the PMTC native compiler parses the `defineTheme({ … })` declaration at COMPILE time (literal leaves only), resolves `styled()` / rocketstyle token interpolations (`${(t) => t.spacing.md}`) against it merged over the bundled defaults, bakes the values into the SwiftUI/Compose emit, and drops the declaration from native output. A shared source importing it builds on all three targets.

**Example**

```tsx
import { defineTheme, styled } from "@pyreon/styler"
import { Stack } from "@pyreon/primitives"

const theme = defineTheme({
  color:   { primary: "#ff3b30" },
  spacing: { sm: 8, xl: 40 },
})
const Card = styled(Stack)`
  padding: ${(t) => t.spacing.xl};
`
// native: VStack{…}.padding(40) / Column(Modifier.padding(40.dp)) — baked
```

**Common mistakes**

- Computing token leaves at runtime (`spacing: { md: base * 2 }`) and expecting native resolution — the PMTC parse takes LITERAL leaves only (a native theme must be static); computed values warn + drop on native
- Expecting defineTheme alone to theme the WEB app — on web it is identity; pass the object to the theme provider (`<PyreonUI theme={…}>`) for the styler interpolations to see it
- Referencing an unknown token (`t.spacing.doesNotExist`) — the native compiler warns + drops the declaration rather than guessing

**See also:** `styled` · `css`

---

### styled `function`

```ts
styled: ((tag: Tag, options?: StyledOptions) => TagTemplateFn) & { div: TagTemplateFn; span: TagTemplateFn; /* …all HTML tags via Proxy */ }
```

Component factory. `styled('div')`, `styled(MyComp)`, and `styled.div` (Proxy sugar) are all tagged templates returning a `ComponentFn` that injects a generated class. Tagged-template interpolations are called with the live `props` object (theme included), so a function interpolation reading `p.theme.color` / signal-driven values works and puts the component on the dynamic resolve path. Supports the polymorphic `as` prop and `$`-prefixed TRANSIENT props (consumed by styles, NOT forwarded to the DOM); `innerRef` is accepted as an alias for `ref`. `options` takes `shouldForwardProp(prop)` (per-component DOM prop filter — replaces the default allowlist) and `layer` (wrap the generated rules in `@layer <name>`). A template with NO function interpolation is resolved and injected ONCE, when the component is defined; per-definition caching keys generated classes so repeat mounts skip re-resolution.

**Example**

```tsx
import { styled } from "@pyreon/styler"

const Button = styled("button")`
  background: ${(p) => p.theme.colors.primary};
  padding: ${(p) => (p.$compact ? "4px" : "12px")};
`
// <Button $compact onClick={...}>Go</Button>  — $compact not forwarded to <button>
```

**Common mistakes**

- Expecting `$`-prefixed props to reach the DOM — they are transient by design (consumed by the template, stripped before forwarding). Use a non-`$` name if the attribute must land on the element
- Destructuring `props` in the interpolation (`${({ theme }) => …}`) and being surprised it does not update on a whole-theme swap — read `props.theme` lazily; the theme context is reactive and the styled resolver re-runs on swap
- Passing a resolved value where a function interpolation is needed for reactivity — `${signal()}` snapshots once at definition; use `${() => signal()}` (or `${(p) => p.x}`) to stay on the dynamic path
- Using `styled.div` and expecting a different identity per call — the Proxy returns the same tag template fn shape; per-definition caches key on the template, not the call site

**See also:** `css` · `useCSS` · `useTheme`

---

### css `function`

```ts
css(strings: TemplateStringsArray, ...values: Interpolation[]): CSSResult
```

Tagged-template that returns a LAZY `CSSResult` — it is NOT a class name or a CSS string until resolved by `styled()`, `useCSS()`, or composition into another template. Compose reusable fragments with it (assign a `css` result to `const base`, then interpolate `base` inside a `styled` template). Resolution is deferred so it can read the props/theme of the consuming component at use time.

**Example**

```tsx
import { css, useCSS } from "@pyreon/styler"

const card = css`border: 1px solid #ddd; padding: 16px;`
function Card(props) {
  const cls = useCSS(card)
  return <div class={cls}>{props.children}</div>
}
```

**Common mistakes**

- Treating the `css` tagged-template return value as a string / class name — it is a lazy `CSSResult`; interpolating it into text (e.g. `class={card}`) renders `[object Object]`. Resolve via `useCSS` or embed in a `styled` template
- Reading props/theme at `css` call time — the template is resolved later; put dynamic bits in function interpolations so they read the LIVE props at use

**See also:** `styled` · `useCSS` · `keyframes`

---

### keyframes `function`

```ts
keyframes(strings: TemplateStringsArray, ...values: Interpolation[]): KeyframesResult
```

Tagged-template returning a `KeyframesResult` whose string form is the GENERATED, content-hashed `@keyframes` animation NAME (`pyr-kf-<hash>`). Reference it inside a `css` / `styled` template as the `animation-name` value. The `@keyframes` rule is injected (deduped via FNV-1a) IMMEDIATELY, when `keyframes` is called — not when a component first uses it — and any function interpolation inside it is resolved against an EMPTY props object (no theme, no component props).

**Example**

```tsx
import { keyframes, styled } from "@pyreon/styler"

const spin = keyframes`from { transform: rotate(0) } to { transform: rotate(360deg) }`
const Spinner = styled("div")`animation: ${spin} 1s linear infinite;`
```

**Common mistakes**

- Expecting a CSS class — `keyframes` yields an animation-NAME token, used as the `animation` / `animation-name` value, not a class applied to an element
- Defining `keyframes` inside the render body per mount — define once at module scope so the hashed rule is injected once and reused
- Reading the theme inside a `keyframes` interpolation (`${(p) => p.theme.x}`) — keyframes resolve at call time against `{}`, so there is no `theme`; put theme-dependent values in the `styled` / `css` template that references the animation

**See also:** `css` · `styled`

---

### createGlobalStyle `function`

```ts
createGlobalStyle(strings: TemplateStringsArray, ...values: Interpolation[]): ComponentFn
```

Returns a `ComponentFn` that injects GLOBAL CSS (resets, `:root` tokens, body styles) when MOUNTED — it is not a side-effecting call. Render the returned component once near the app root. The injected rule PERSISTS for the document's lifetime, deduped by content hash — like emotion's `injectGlobal`, and UNLIKE styled-components' `createGlobalStyle`, it is NOT removed on unmount (a global reset shouldn't vanish when the mounting component re-renders away). A template with NO function interpolation is injected immediately, when `createGlobalStyle` is called — rendering the component is then a no-op. A template WITH function interpolations resolves when the component mounts, ONCE per mount, against its props plus a snapshot of the theme; it does not re-resolve when a signal or the theme changes later, and each distinct resolution adds another persistent rule.

**Example**

```tsx
import { createGlobalStyle } from "@pyreon/styler"

const GlobalReset = createGlobalStyle`
  *, *::before, *::after { box-sizing: border-box }
  body { margin: 0; font-family: ${(p) => p.theme.fonts.body}; }
`
// render <GlobalReset /> once at the app root
```

**Common mistakes**

- Assuming nothing injects until render — a fully static template injects at call time (module evaluation); only a template with function interpolations waits for `<GlobalReset />` to mount. Mount it once near the root either way so the intent is visible
- Expecting a dynamic global block to follow a theme or signal change — it resolves once per mount (theme snapshot); for live global values, set CSS custom properties on `:root` and reference them from a static global
- Expecting the global CSS to be removed when the component unmounts — it persists (deduped by hash), matching emotion `injectGlobal` not styled-components. Toggle globals with a class/attribute on `:root`, not by mounting/unmounting the component

**See also:** `styled` · `css`

---

### useCSS `hook`

```ts
useCSS(template: CSSResult, props?: Record<string, any>, boost?: boolean): string
```

Resolves a `CSSResult` (from the `css` tagged template) to an injected class-name string inside a component. Function interpolations receive `props` merged with a snapshot of the current theme. It resolves ONCE, when called — the returned string is a plain value, not a reactive binding, so later prop or theme changes do not re-resolve it. The third `boost` parameter is accepted for compatibility but currently has no effect. The returned class is deduped/hashed by the singleton `sheet`.

**Example**

```tsx
import { css, useCSS } from "@pyreon/styler"

const box = css`color: ${(p) => p.danger ? "red" : "inherit"};`
function Box(props) {
  return <div class={useCSS(box, props)}>{props.children}</div>
}
```

**Common mistakes**

- Forgetting to pass `props` when the template has function interpolations — they then resolve against the theme alone and the prop-driven values are lost
- Expecting `useCSS(box, props)` to update when `props.danger` flips — it resolves once at setup; for signal-driven styles use a `styled()` component (its resolver tracks props and theme)
- Passing `boost: true` expecting a faster path — the parameter is ignored by the current sheet
- Calling `useCSS` outside a component setup — it depends on the active sheet/theme context like any hook

**See also:** `css` · `styled`

---

### useTheme `hook`

```ts
useTheme<T extends object = Theme>(): T
```

Returns the current theme as a SNAPSHOT at call time. `ThemeContext` is a REACTIVE context — `useTheme()` reads it once, so the returned object is static unless the read happens inside a reactive scope. For values that must track whole-theme swaps inside an `effect` / `computed`, use `useThemeAccessor()` instead.

**Example**

```tsx
import { useTheme } from "@pyreon/styler"

function Badge() {
  const t = useTheme()
  return <span style={{ color: t.colors.primary }}>{/* … */}</span>
}
```

**Common mistakes**

- Destructuring `const { colors } = useTheme()` and expecting it to update on a user-preference theme swap — the snapshot is captured once. Use `useThemeAccessor()` and read inside the reactive scope, or rely on `styled` templates (their resolver tracks the theme)
- Calling `useTheme()` at module scope — it must run during component setup where the context is available

**See also:** `useThemeAccessor` · `ThemeProvider` · `styled`

---

### useThemeAccessor `hook`

```ts
useThemeAccessor<T extends object = Theme>(): () => T
```

Returns the raw `() => T` theme accessor (not a snapshot). Call it inside an `effect` / `computed` / JSX thunk so the read TRACKS the reactive theme context — whole-theme swaps (user-preference themes) then re-run the consumer without a remount. This is the escape hatch `styled()` itself uses internally.

**Example**

```tsx
import { useThemeAccessor } from "@pyreon/styler"
import { effect } from "@pyreon/reactivity"

const theme = useThemeAccessor()
effect(() => applyChartPalette(theme().colors)) // re-runs on theme swap
```

**Common mistakes**

- Calling the accessor once at setup and caching the result — that defeats the point; call it INSIDE the reactive scope every time so the dependency is tracked
- Reaching for this when a `styled` template would do — the template resolver already tracks the theme; use the accessor only for imperative/non-CSS theme reads

**See also:** `useTheme` · `ThemeProvider`

---

### ThemeProvider `component`

```ts
ThemeProvider(props: { theme: Theme; children?: VNodeChild }): VNode | null
```

Low-level provider for the reactive `ThemeContext` — marked `@internal` / `@deprecated` in source in favour of `<PyreonUI theme={…}>` from `@pyreon/ui-core`. It provides exactly the object it receives: no merge with a parent theme, no enrichment (breakpoints, CSS variables), and no ui-core context for rocketstyle components. The `theme` prop is read once at setup, so passing a different theme later does not update consumers — swap themes through `<PyreonUI>`, whose provided theme is reactive. `<PyreonUI>` provides `ThemeContext` itself rather than wrapping this component. Marked `nativeCompat` so it works inside `@pyreon/{react,preact,vue,solid}-compat` apps.

**Example**

```tsx
import { ThemeProvider } from "@pyreon/styler"

// Standalone styler use, outside any <PyreonUI>:
<ThemeProvider theme={{ colors: { primary: "#06f" } }}>
  <App />
</ThemeProvider>
```

**Common mistakes**

- Passing a function to extend the parent theme (`theme={(parent) => …}`) — there is no function form; the object is provided as-is. Read the parent with `useTheme()` and spread it yourself, or nest `<PyreonUI>` (it inherits the parent theme)
- Expecting a signal-driven `theme={t()}` to swap the theme — the prop is read once at setup; use `<PyreonUI theme={…}>` for reactive theme swaps
- Using it in an app that renders `<PyreonUI>` — PyreonUI already provides `ThemeContext` (enriched); a nested `ThemeProvider` replaces it with the raw object for that subtree

**See also:** `useTheme` · `useThemeAccessor` · `ThemeContext`

---

### ThemeContext `constant`

```ts
ThemeContext: ReactiveContext<Theme>
```

The reactive context backing the theme. Created via `createReactiveContext<Theme>` — `useContext(ThemeContext)` returns a `() => Theme` accessor (which is what `useTheme()` / `useThemeAccessor()` wrap). Exposed for advanced consumers building their own theme-aware primitives; prefer the hooks for app code.

**Example**

```tsx
import { ThemeContext } from "@pyreon/styler"
import { useContext } from "@pyreon/core"

const themeAccessor = useContext(ThemeContext) // () => Theme
```

**Common mistakes**

- Treating `useContext(ThemeContext)` as the theme object — it is the ACCESSOR `() => Theme` (reactive context). Call it to read

**See also:** `useTheme` · `useThemeAccessor` · `ThemeProvider`

---

### createSheet `function`

```ts
createSheet(options?: StyleSheetOptions): StyleSheet
```

Creates an ISOLATED `StyleSheet` instance (its own FNV-1a dedup cache + rule registry) instead of the shared singleton `sheet`. Use for shadow-DOM roots, multi-window/iframe rendering, per-request SSR isolation, or test isolation where one request/realm must not share the global dedup cache. Options: `maxCacheSize`, `layer` (wrap scoped rules in an `@layer`), and `nonce` (CSP — stamps the SSR `<style>` from `getStyleTag()` and the client `<style>` element with a `nonce` so a strict `style-src 'nonce-…'` policy admits the critical CSS). Most apps never need this — the singleton is correct for a single document.

**Example**

```tsx
import { createSheet } from "@pyreon/styler"

const shadowSheet = createSheet({ /* StyleSheetOptions */ })
```

**Common mistakes**

- Creating a fresh sheet per render — defeats dedup; create once per realm/root and reuse
- Mixing the singleton and an isolated sheet for the same DOM — classes from one will not be deduped against the other; pick one per document root

**See also:** `StyleSheet` · `sheet`

---

### StyleSheet `class`

```ts
class StyleSheet { constructor(options?: StyleSheetOptions) }
```

The CSS injection engine: FNV-1a content hashing, a dedup cache (identical CSS → one rule), and SSR support (collect rules to a string on the server, hydrate on the client). `sheet` is the process singleton; `createSheet()` wraps `new StyleSheet()`. Direct instantiation is for custom integrations (server frameworks collecting critical CSS, test harnesses).

**Example**

```tsx
import { StyleSheet } from "@pyreon/styler"

const s = new StyleSheet({ /* options */ })
```

**Common mistakes**

- Instantiating `new StyleSheet()` in app code — use the exported `sheet` singleton (or `createSheet()` for explicit isolation); a stray instance will not be where `styled()` injects

**See also:** `createSheet` · `sheet`

---

### sheet `constant`

```ts
sheet: StyleSheet
```

The process-wide singleton `StyleSheet` that `styled()` / `css` / `keyframes` / `createGlobalStyle` inject into by default. For SSR, render the app and then emit `sheet.getStyleTag(nonce?)` (a complete `<style>` tag) or `sheet.getStyles()` (the CSS text) into the document head; do not mutate it directly.

**Example**

```tsx
import { sheet } from "@pyreon/styler"
// SSR: render the app, then read the collected rules off `sheet` for the <head>
```

**See also:** `StyleSheet` · `createSheet`

---

### resolve `function`

```ts
resolve(strings: TemplateStringsArray, values: Interpolation[], props: Record<string, any>): string
```

Low-level: resolve a tagged-template (strings + interpolations) against a `props` object into a final CSS string (function interpolations invoked with `props`). The engine `styled()` / `useCSS` build on. Direct use is for custom CSS-in-JS layered on top of styler; app code should prefer `styled` / `css`.

**Example**

```tsx
import { resolve } from "@pyreon/styler"

const cssText = resolve(strings, values, { theme, $compact: true })
```

**See also:** `normalizeCSS` · `resolveValue` · `styled`

---

### normalizeCSS `function`

```ts
normalizeCSS(css: string): string
```

Normalizes a raw CSS string (whitespace/format canonicalization) so identical-intent CSS hashes to the same FNV-1a key and dedupes. Memoized via an internal cache — call `clearNormCache()` to drop it (tests / long-lived processes).

**Example**

```tsx
import { normalizeCSS } from "@pyreon/styler"

normalizeCSS("color:  red ;") // canonical form, dedup-stable
```

**See also:** `clearNormCache` · `resolve`

---

### resolveValue `function`

```ts
resolveValue(value: Interpolation, props: Record<string, any>): string
```

Resolves a SINGLE interpolation against `props`: invokes function interpolations with `props`, flattens nested `CSSResult` / `KeyframesResult`, and stringifies the result. The per-interpolation primitive `resolve()` loops over.

**Example**

```tsx
import { resolveValue } from "@pyreon/styler"

resolveValue((p) => p.theme.colors.primary, { theme })
```

**See also:** `resolve` · `isDynamic`

---

### clearNormCache `function`

```ts
clearNormCache(): void
```

Clears the `normalizeCSS` memo cache. Needed in test suites that assert on injection counts / sheet contents across cases, and in long-lived processes that churn unique CSS and want to bound the cache. No effect on already-injected rules.

**Example**

```tsx
import { clearNormCache } from "@pyreon/styler"

afterEach(() => clearNormCache())
```

**See also:** `normalizeCSS`

---

### buildProps `function`

```ts
buildProps(rawProps: Record<string, any>, generatedCls: string, isDOM: boolean, customFilter?: (prop: string) => boolean): Record<string, any>
```

Builds the final prop object forwarded to the rendered element: merges the generated class, drops `$`-transient props, and (for DOM targets) filters non-DOM attributes — `customFilter` overrides per-component. **Copies DESCRIPTORS, not values**, so compiler-emitted reactive (`_rp` getter) props survive forwarding instead of collapsing to a static snapshot.

**Example**

```tsx
import { buildProps } from "@pyreon/styler"

const forwarded = buildProps(rawProps, "sc-abc123", true)
```

**Common mistakes**

- Re-implementing prop forwarding with `result[key] = source[key]` — that fires getters and freezes reactive props to a one-time value. styler uses descriptor copy specifically to preserve the `_rp` getter contract; any custom forwarder must do the same
- Passing `isDOM: true` for a component target — DOM-attr filtering will strip props the wrapped component legitimately needs
- Assuming a `customFilter` still strips `$`-props — on a DOM target, a custom filter REPLACES the default allowlist entirely, `$`-transient handling included; return `false` for `$`-prefixed names yourself

**See also:** `filterProps` · `styled`

---

### filterProps `function`

```ts
filterProps(props: Record<string, unknown>): Record<string, unknown>
```

Returns a copy of `props` keeping ONLY known HTML attributes plus `data-*` / `aria-*` (an allowlist, not a denylist); `$`-transient props and `as` are always dropped, and any unknown prop name is dropped too. It is the default DOM-safety filter `buildProps` applies for element targets, exposed for consumers doing their own forwarding. Own enumerable keys only; descriptor-preserving, same reactive-prop rationale as `buildProps`.

**Example**

```tsx
import { filterProps } from "@pyreon/styler"

const domSafe = filterProps(props)
```

**See also:** `buildProps`

---

### isDynamic `function`

```ts
isDynamic(v: Interpolation): boolean
```

True when an interpolation is a function (signal accessor / props reader) — i.e. the styled component must take the DYNAMIC resolve path (re-resolve per prop/theme change) rather than the static cached path. Used internally to decide the resolver branch; exported for tooling that mirrors that decision.

**Example**

```tsx
import { isDynamic } from "@pyreon/styler"

isDynamic((p) => p.color) // true → dynamic path
isDynamic("12px")          // false → static, cached
```

**See also:** `resolve` · `styled`

---

### hash / hashUpdate / hashFinalize / HASH_INIT `function`

```ts
hash(str: string) => string — hashUpdate(state: number, str: string) => number — hashFinalize(state: number) => string — HASH_INIT: number
```

The FNV-1a non-cryptographic hash styler uses for compact, deduped class names + rule keys. `hash(str)` is the one-shot form → a base-36 string. The streaming trio composes it: `hashUpdate(HASH_INIT, "ab")` folds bytes into a running 32-bit numeric state, `hashFinalize(state)` renders `(state >>> 0).toString(36)`, and `hashUpdate(hashUpdate(HASH_INIT, "ab"), "cd") === hash("abcd")`. Exported for tooling/consumers that need the SAME class-name hash styler emits (e.g. precomputing a class name before injection). Low-level — most apps never call it.

**Example**

```tsx
import { hash, hashUpdate, hashFinalize, HASH_INIT } from "@pyreon/styler"
hash("color:red")  // e.g. "1a2b3c"
hashFinalize(hashUpdate(hashUpdate(HASH_INIT, "a"), "b")) === hash("ab")
```

**Common mistakes**

- Using it for anything security-sensitive — FNV-1a is NON-cryptographic (fast, collision-cheap for CSS keys, NOT collision-resistant against adversarial input).
- Feeding the base-36 STRING from `hashFinalize` back into `hashUpdate` — the streaming state is the 32-bit NUMBER; keep folding numbers with `hashUpdate` and call `hashFinalize` ONCE at the end.

**See also:** `createSheet` · `styled`

---

### setStyleExtraction `function`

```ts
setStyleExtraction(enabled: boolean, rewrite?: (cssText: string, varsOut: Record<string, string>) => string) => void
```

Internal dependency-injection seam for Custom-Property Style Extraction (CPSE). `@pyreon/ui-core`'s `init({ styleExtraction: true })` calls this to enable CPSE and inject the `cpseRewrite` function — which lives in `@pyreon/unistyle` (styler cannot import unistyle: dep direction), so it is threaded in at init time. When on, the static + SSR resolve path rewrites resolved CSS to hoist per-instance values into custom properties. Apps do NOT call this directly — enable CPSE via the `@pyreon/ui-core` init flag; it is exported only so ui-core can wire it.

**Example**

```tsx
// Apps enable CPSE through ui-core, not this call:
import { init } from "@pyreon/ui-core"
init({ styleExtraction: true }) // ui-core calls setStyleExtraction under the hood
```

**Common mistakes**

- Calling `setStyleExtraction(true)` directly to turn on CPSE — without the `rewrite` from `@pyreon/unistyle` (which `@pyreon/ui-core` supplies) it enables the branch with no rewriter. Use `init({ styleExtraction: true })` from `@pyreon/ui-core`.

**See also:** `styled` · `createSheet`

---

## Package-level notes

> **css / keyframes return lazy values, not strings:** The `css` tagged template yields a `CSSResult` (resolved on use, never injected by itself); `keyframes` stringifies to an animation NAME and injects its `@keyframes` rule at CALL time; `createGlobalStyle` returns a `ComponentFn` — a fully static template injects at call time, a dynamic one when the component mounts.

> **Theme context is reactive:** `useTheme()` is a snapshot; `useThemeAccessor()` is the tracking accessor. `styled` / `useCSS` templates already track the theme through their resolver, so whole-theme swaps re-resolve CSS + swap class names WITHOUT remounting the VNode. Destructuring `useTheme()` and reading outside a reactive scope freezes the value.

> **Prop forwarding copies descriptors:** `buildProps` / `filterProps` copy property DESCRIPTORS (not values) so compiler-emitted `_rp` getter props keep their reactive subscription end-to-end. Any custom prop-forwarding wrapper layered on styler MUST do the same — plain `result[k] = src[k]` silently collapses signal-driven props to a one-time snapshot.

> **Singleton sheet by default:** All injection goes through the `sheet` singleton (FNV-1a dedup, SSR). `createSheet()` / `new StyleSheet()` are only for isolated realms (shadow DOM, iframes, test isolation) — mixing sheets for one document breaks dedup.

> **CSP nonce for strict style-src:** Under a strict `style-src 'nonce-…'` policy (no `'unsafe-inline'`), the SSR-inlined critical `<style>` needs a nonce or the browser blocks it on first paint (client CSSOM `insertRule` is CSP-exempt regardless). Pass the per-request nonce to `sheet.getStyleTag(nonce)`, or set `createSheet({ nonce })` as a default — both stamp the SSR `<style>` and the client `<style>` element.
