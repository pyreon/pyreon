---
title: UI Core
description: The PyreonUI provider, mode resolution, CSS-variables theming, and shared foundation for the Pyreon UI system.
---

`@pyreon/ui-core` is the foundation layer of the Pyreon UI system. It ships `PyreonUI` — a single provider that replaces the old three-provider split (theme + mode + config) — plus reactive mode resolution (`useMode`), an opt-in CSS-variables theming mode, the `init()` escape hatch for non-provider environments, and the zero-dependency utilities every other UI package builds on.

<PackageBadge name="@pyreon/ui-core" href="/docs/ui-core" />

## Installation

:::code-group

```bash [npm]
npm install @pyreon/ui-core
```

```bash [bun]
bun add @pyreon/ui-core
```

```bash [pnpm]
pnpm add @pyreon/ui-core
```

```bash [yarn]
yarn add @pyreon/ui-core
```

:::

## Quick Start

Wrap your app in a single `PyreonUI` provider. It wires the theme, the color mode, and the internal config context in one component — no separate `init()` call, no nested providers.

```tsx
import { PyreonUI, useMode } from '@pyreon/ui-core'
import { enrichTheme } from '@pyreon/unistyle'

const theme = enrichTheme({
  colors: { primary: '#3b82f6', secondary: '#6366f1' },
  fonts: { body: 'Inter, sans-serif' },
})

const App = () => (
  <PyreonUI theme={theme} mode="system">
    <MyApp />
  </PyreonUI>
)

// useMode() reads the resolved mode reactively — "light" or "dark"
function ThemeBadge() {
  const mode = useMode()
  return <div class={mode() === 'dark' ? 'badge-dark' : 'badge-light'}>{mode()}</div>
}
```

<Example file="./examples/ui-core/theme-mode-provider" title="Theme Mode Provider" />

## Why a Single Provider?

Earlier Pyreon UI required three nested providers — one for the styler theme, one for the mode, one for the config context. `PyreonUI` collapses all three into one mount and calls `init()` internally, so consumers never wire the layers up by hand.

```tsx
// ❌ The old split — three nested providers, manual init()
init({ styled, css })
;<ThemeProvider theme={theme}>
  <ModeProvider mode="dark">
    <ConfigProvider value={config}>
      <App />
    </ConfigProvider>
  </ModeProvider>
</ThemeProvider>

// ✅ One provider, zero init wiring
;<PyreonUI theme={theme} mode="dark">
  <App />
</PyreonUI>
```

:::warning
Do not reach for `ThemeProvider` / `ModeProvider` / `ConfigProvider` separately — `PyreonUI` is the single replacement that covers all three. The low-level `Provider` export (a.k.a. `CoreProvider`) is `@internal`/`@deprecated` and warns in dev; prefer `PyreonUI`.
:::

## The `PyreonUI` Provider

`PyreonUI` accepts three props plus children. All are optional except in practice you want at least a `theme` at the outermost provider.

```tsx
interface PyreonUIProps {
  theme?: PyreonTheme
  mode?: 'light' | 'dark' | 'system' | (() => 'light' | 'dark' | 'system')
  inversed?: boolean
  children?: VNodeChild
}
```

### `theme`

An enriched theme object. Always run a raw theme through `enrichTheme()` (re-exported from `@pyreon/unistyle`) first so it carries the default breakpoints, `rootSize`, and unit utilities the system expects.

```tsx
import { enrichTheme } from '@pyreon/unistyle'

const theme = enrichTheme({
  colors: { primary: '#3b82f6' },
  spacing: { small: 8, medium: 16 },
})

;<PyreonUI theme={theme}>
  <App />
</PyreonUI>
```

When `theme` is **omitted**, the theme is inherited from the nearest ancestor `PyreonUI` — this is what makes a nested `<PyreonUI inversed>` work without re-passing the theme. At the outermost provider with no ancestor and no theme, styled descendants see theme fields as `undefined` (no crash, but no design tokens either) — so pass a real theme at the top.

:::warning
Forgetting `enrichTheme()` ships a raw theme object that's missing the default breakpoints, spacing, and unit utilities. Always enrich the theme you pass to the outermost `PyreonUI`.
:::

:::warning
Do not re-augment the `ThemeDefault` / `StylesDefault` interfaces in your app — `@pyreon/ui-theme` already augments them. Double-augmentation throws `TS2320` ("cannot simultaneously extend").
:::

### `mode`

The color mode: `'light'`, `'dark'`, or `'system'`. It can also be a signal or getter for reactive switching.

```tsx
import { signal } from '@pyreon/reactivity'

// Static
;<PyreonUI theme={theme} mode="dark">…</PyreonUI>

// Reactive signal / getter — toggling the signal re-resolves the mode
const mode = signal<'light' | 'dark' | 'system'>('light')
;<PyreonUI theme={theme} mode={mode}>…</PyreonUI>

// System — follows the OS preference (see below)
;<PyreonUI theme={theme} mode="system">…</PyreonUI>
```

When `mode` is **omitted**, the resolved mode is inherited from the nearest ancestor `PyreonUI` (or `'light'` at the root).

### `inversed`

Flip the resolved mode for a nested section — e.g. a dark sidebar inside a light app. The flip is scoped: only descendants of that `PyreonUI` see the inverted mode; ancestors and siblings are unchanged.

```tsx
<PyreonUI theme={theme} mode="light">
  <Header />
  {/* inherits the theme, inherits mode="light", then flips → "dark" */}
  <PyreonUI inversed>
    <DarkSidebar />
  </PyreonUI>
</PyreonUI>
```

When `inversed` is set without an explicit `mode`, the provider inherits the parent's mode and flips it (`light → dark`, `dark → light`).

:::warning
Do not destructure `props` inside a provider or component — components run once in Pyreon, so destructuring captures values at setup time and loses reactivity. `PyreonUI` reads `props.mode` / `props.inversed` lazily inside its reactive resolver for exactly this reason. Read props lazily inside reactive scopes in your own components too.
:::

## `mode="system"` — OS Dark-Mode Detection

When `mode="system"`, `PyreonUI` subscribes to `matchMedia('(prefers-color-scheme: dark)')` and resolves the mode against the OS preference. The subscription is **lazy** — created on first read — and a single document-lifetime listener serves every `useMode()` consumer. When the user changes their system setting, the resolved mode updates reactively and every reader re-runs.

```tsx
<PyreonUI theme={theme} mode="system">
  <App />
</PyreonUI>

// Anywhere in the subtree:
const mode = useMode() // tracks the OS preference, reactive
```

The detection is SSR-safe: when there's no DOM (`matchMedia` unavailable), the system mode resolves to `'light'` on the server. For correct first-paint mode under SSR, pair this with [`cssVariablesPrePaintScript()`](#fouc-prevention-csspaintscript) (CSS-variables mode) or stamp the mode on `<html>` server-side.

## `useMode()` — Reading the Resolved Mode

`useMode()` returns the currently resolved mode as a reactive signal — `'light'` or `'dark'` (never `'system'`; that's resolved away). It reflects the OS preference under `mode="system"` and any `inversed` flips applied by ancestors. The subscription is component-scoped: readers re-run only when the resolved mode actually changes.

```tsx
import { useMode } from '@pyreon/ui-core'

function ThemeIcon() {
  const mode = useMode()
  // mode() returns "light" | "dark" — reactive, resolved
  return <span>{mode() === 'dark' ? '🌙' : '☀️'}</span>
}
```

:::warning
`useMode()` returns a `Signal`, not a value — you must **call** it (`mode()`) to read. `mode` alone is the signal function, not the string.
:::

:::warning
Calling `useMode()` outside any `PyreonUI` ancestor falls back to a default (`'light'`) but loses the reactive system / inversed handling. Mount a `PyreonUI` above any component that reads the mode.
:::

## CSS-Variables Theming Mode

`init({ cssVariables: true })` opts into a ui-system-wide CSS-variables theming mode. Instead of resolving theme tokens to class names per component, the theme JSON is autogenerated into CSS custom properties (`--px-*`), and a dark/light flip becomes **one attribute write** on `<html>` — no re-resolution, no className churn, zero per-component JavaScript on the flip.

Enable it once at boot, **before** the first render:

```tsx
import { init } from '@pyreon/ui-core'

init({ cssVariables: true })
// or with options:
init({ cssVariables: { prefix: 'px', attribute: 'data-theme' } })
```

What `PyreonUI` does under this flag:

- Autogenerates `--px-*` custom properties from the enriched theme (`themeToCssVars`) and injects the `:root` block once per theme identity (SSR-aware — the block rides `getStyleTag()` / the stream flush on the server).
- Provides a **var-leaf** theme tree — every eligible theme value becomes a `var(--px-…)` reference string that flows through the styler / unistyle value pipeline untouched.
- The **root** `PyreonUI` writes the mode attribute to `document.documentElement` (so it sits at `:root`, where the var rules cascade from).
- **Nested / `inversed`** providers render a layout-neutral `display: contents` wrapper carrying the mode attribute, scoping the override to their subtree via the CSS cascade.
- Component-level `mode(a, b)` pairs (from rocketstyle) become hashed var pairs resolved by the `data-theme` attribute.

```tsx
init({ cssVariables: true })

const App = () => (
  <PyreonUI theme={theme} mode="dark">
    <Dashboard />
  </PyreonUI>
)

// Toggling mode is now one documentElement attribute write — the cascade
// re-resolves every mode-pair var; component classNames never change.
```

### CSS-variables config options

| Option      | Type     | Default        | Description                                                            |
| ----------- | -------- | -------------- | ---------------------------------------------------------------------- |
| `prefix`    | `string` | `'px'`         | Custom-property prefix: `--<prefix>-<path>`                            |
| `attribute` | `string` | `'data-theme'` | Attribute carrying the active mode on `<html>` / nested wrappers       |

`resolveCssVariables()` is the single accessor that returns the defaulted config (`{ enabled, prefix, attribute }`) — the same one `PyreonUI` and the rocketstyle mode-pair factory read.

:::warning
The `cssVariables` switch is a **boot-time contract** — set it via `init()` before the first render. Theme-resolution caches across the ui-system assume the flag does not flip mid-session. Toggling it after the first render produces inconsistent resolution.
:::

:::warning
Under `cssVariables`, `mode(a, b)` pairs with **number** values are emitted **verbatim** into CSS custom properties — they are NOT unit-converted. Pass unit-complete strings (e.g. `'8px'`, not `8`) for mode pairs.
:::

## FOUC Prevention — `cssVariablesPrePaintScript()`

Under `cssVariables`, the root `PyreonUI` keeps `document.documentElement` in sync **after** hydration via an effect — but on a server-rendered or large/streamed document, there's a window before that effect runs where the page can paint with the wrong mode (the classic dark-mode flash). `cssVariablesPrePaintScript()` builds a self-contained, blocking `<head>` script that sets the mode attribute on `documentElement` **before first paint**.

```tsx
import { cssVariablesPrePaintScript } from '@pyreon/ui-core'

// In your document <head>, BEFORE the app bundle:
// <script>{cssVariablesPrePaintScript()}</script>
```

The script reads, in order:

1. A persisted user toggle from `localStorage` (default key `'zero-theme'`, values `'light'`/`'dark'`),
2. else the OS `prefers-color-scheme`,
3. else `fallback` (default `'light'`),

and writes the attribute at `:root` — exactly where the var rules cascade from and where the root `PyreonUI` writes after hydration, so the two agree and there's no flash for `mode="system"` or a persisted toggle. It's dependency-free and `try/catch`-wrapped (a storage/matchMedia throw never blocks paint).

```tsx
cssVariablesPrePaintScript({
  attribute: 'data-theme', // defaults to the resolved init({ cssVariables }) attribute
  storageKey: 'zero-theme',
  fallback: 'light',
})
```

:::tip
`@pyreon/zero` apps don't need this directly — zero's existing `themeScript` export already writes the same attribute and composes with the root provider. Inject `cssVariablesPrePaintScript()` for non-zero apps.
:::

:::warning
Place the script in `<head>`, not at end-of-body — it must run before first paint. An in-body script can flash on a streamed or large document.
:::

:::warning
The pre-paint script and the root `PyreonUI` are **both** needed under `cssVariables`: the script fixes the pre-hydration paint; the root provider keeps `documentElement` in sync after hydration. Don't ship one without the other.
:::

:::warning
The one case the script can't cover: a hardcoded `mode="dark"` SSR app with **no** stored preference. That mode lives only in the app's JSX, unknown to a pre-paint script — stamp `<html data-theme="dark">` server-side (or persist the preference) for that case.
:::

## `init()` — The Escape Hatch

`PyreonUI` calls `init()` internally, so you rarely call it directly. It's the escape hatch for environments where the provider tree is unavailable — tests, or SSR setups that bypass `PyreonUI`. It configures the CSS engine connector and the ui-system-wide flags.

```tsx
import { init } from '@pyreon/ui-core'
import { styled, css, keyframes } from '@pyreon/styler'

init({
  styled,
  css,
  keyframes,
  cssVariables: true, // opt into CSS-variables theming
})
```

`init()` accepts a partial config:

| Field               | Type                                | Description                                                              |
| ------------------- | ----------------------------------- | ------------------------------------------------------------------------ |
| `css`               | `CSSEngineConnector['css']`         | The `css` tag from the CSS engine (`@pyreon/styler`)                     |
| `styled`            | `StyledFunction`                    | The `styled` factory                                                     |
| `keyframes`         | `CSSEngineConnector['keyframes']`   | The `keyframes` factory                                                  |
| `component`         | `string \| HTMLTags`                | Default Element host tag (default `'div'`)                              |
| `textComponent`     | `string \| HTMLTags`                | Default Text host tag (default `'span'`)                                |
| `createMediaQueries`| `(props) => Record<…>`              | Optional media-query factory hook                                       |
| `cssVariables`      | `boolean \| CssVariablesConfig`     | Opt-in CSS-variables theming (default `false`)                          |
| `styleExtraction`   | `boolean`                           | Opt-in Custom-Property Style Extraction for the styled/Element pipeline |

:::note
The `config` singleton is exported too (`import { config } from '@pyreon/ui-core'`). It carries the current CSS engine wiring (`config.css`, `config.styled`, …) and the resolved flags. Downstream packages read it; apps generally use `init()` instead of mutating it.
:::

## Low-Level Context & Provider

`PyreonUI` is the right mount in almost every case. The raw `context` and the low-level `Provider` are exported for advanced/internal use.

```tsx
import { Provider, context } from '@pyreon/ui-core'
```

- `context` — the internal `CoreContextValue` reactive context (`{ theme, mode, isDark, isLight }`). Because it's a reactive context, `useContext(context)` returns a getter — call it to read.
- `Provider` (`CoreProvider`) — the low-level theme provider. `@internal` / `@deprecated`; it warns in dev. Prefer `PyreonUI`.

## Utilities

`@pyreon/ui-core` ships zero-dependency helpers used across the UI system. They're available to apps too.

### Object Helpers

```tsx
import { merge, omit, pick, get, set } from '@pyreon/ui-core'

merge({ a: 1 }, { b: 2 }) // { a: 1, b: 2 } — deep merge, plain-object recursion
omit({ a: 1, b: 2, c: 3 }, ['b']) // { a: 1, c: 3 }
pick({ a: 1, b: 2, c: 3 }, ['a']) // { a: 1 }
get({ a: { b: 1 } }, 'a.b') // 1 (dot/bracket paths; default value supported)
set({}, 'a.b', 1) // { a: { b: 1 } }
```

:::note
`omit` and `pick` copy own property **descriptors**, not values — so getter-shaped reactive props (the `<Comp prop={signal()}>` shape produced by the compiler) survive the copy with their reactive subscription intact. For plain data the behaviour is identical to value-copying. `get` / `set` guard against prototype-pollution keys (`__proto__`, `prototype`, `constructor`). `omit` also accepts a pre-built `Set<string>` for hot paths that reuse the same key list.
:::

### Comparison Helpers

```tsx
import { isEqual, isEmpty } from '@pyreon/ui-core'

isEqual({ a: 1 }, { a: 1 }) // true — deep structural equality
isEmpty({}) // true
isEmpty([]) // true
isEmpty(null) // true
isEmpty({ a: 1 }) // false
```

### Throttle

```tsx
import { throttle } from '@pyreon/ui-core'

const onScroll = throttle(handleScroll, 100, { leading: true, trailing: true })
onScroll.cancel() // cancel a pending trailing invocation
```

`leading` and `trailing` both default to `true`. The returned function carries a `.cancel()` method that clears any pending trailing call.

### Component Composition

```tsx
import { compose, hoistNonReactStatics } from '@pyreon/ui-core'

// compose applies higher-order components RIGHT-TO-LEFT (rightmost runs first)
const Enhanced = compose(withAuth, withTheme, withLogger)(BaseComponent)
// equivalent to withAuth(withTheme(withLogger(BaseComponent)))

// hoistNonReactStatics copies non-framework statics from source to target
hoistNonReactStatics(WrappedComponent, OriginalComponent)
```

:::warning
`compose` applies functions **right-to-left** (`reduceRight`) — the rightmost HOC wraps the base component first, the leftmost wraps last (outermost). This matches the standard functional `compose` order, not left-to-right pipe order.
:::

### Stable Values

```tsx
import { useStableValue } from '@pyreon/ui-core'

// Returns a referentially stable reference — the identity only changes
// when the value is no longer deeply equal to the previous one.
const stable = useStableValue(derivedConfig)
```

### Slot & Component Helpers

```tsx
import { render, resolveSlot, isPyreonComponent } from '@pyreon/ui-core'
```

- `render(content, attachProps?)` — flexible element renderer: primitives and arrays pass through, component functions mount via `h()`, render props are called with `attachProps`, falsy values return `null`. Used by the bases to normalize slot content.
- `resolveSlot(value)` — resolves a slot value inside a reactive accessor. A component-reference (`beforeContent={Header}`) mounts as `h(Header, null)`; an anonymous reactive accessor (`() => <Icon name={signal()} />`) is called bare so its signal reads land in the enclosing reactive scope. Returns the resolved atom.
- `isPyreonComponent(value)` — discriminates a component-reference from a plain reactive-accessor function (both are `typeof === 'function'`). Uses framework markers (`IS_ROCKETSTYLE` / `PYREON__COMPONENT` / `pkgName`) first, then a naming convention (explicit `displayName`, or a PascalCase `.name`).

## HTML Tag Constants

`@pyreon/ui-core` exports the canonical HTML tag lists the Element / Text bases use for tag dispatching and prop filtering.

```tsx
import { HTML_TAGS, HTML_TEXT_TAGS } from '@pyreon/ui-core'

// HTML_TAGS      — every valid HTML tag name
// HTML_TEXT_TAGS — tags that carry inline text content (span, p, label, …)
```

The matching types are `HTMLTags`, `HTMLTextTags`, `HTMLElementAttrs`, and `HTMLTagAttrsByTag<T>` (the attribute shape for a given tag).

## API Reference

### `PyreonUI(props)`

| Prop       | Type                                                        | Description                                                              |
| ---------- | ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| `theme`    | `PyreonTheme`                                               | Enriched theme object. Inherited from ancestor when omitted              |
| `mode`     | `'light' \| 'dark' \| 'system' \| (() => ThemeModeInput)`  | Color mode; `'system'` follows OS preference. Inherited when omitted     |
| `inversed` | `boolean`                                                  | Flip the resolved mode for this subtree only                            |
| `children` | `VNodeChild`                                               | Subtree                                                                  |

### Exports

| Export                     | Type      | Description                                                                  |
| -------------------------- | --------- | ---------------------------------------------------------------------------- |
| `PyreonUI`                 | Component | Unified provider — theme + mode + config in one mount                       |
| `useMode`                  | Hook      | Returns `Signal<'light' \| 'dark'>` — the reactive resolved mode             |
| `init`                     | Function  | Escape-hatch config: CSS engine connector + `cssVariables`/`styleExtraction` |
| `config`                   | Object    | The configuration singleton (current engine wiring + flags)                 |
| `resolveCssVariables`      | Function  | Returns the defaulted `{ enabled, prefix, attribute }` config               |
| `cssVariablesPrePaintScript` | Function | Builds the blocking `<head>` FOUC script for CSS-variables mode             |
| `Provider`                 | Component | `@internal`/`@deprecated` low-level theme provider — prefer `PyreonUI`       |
| `context`                  | Context   | Internal `CoreContextValue` reactive context                                |
| `compose`                  | Function  | HOC composition (right-to-left)                                             |
| `render`                   | Function  | Flexible element/slot renderer                                              |
| `resolveSlot`              | Function  | Resolve a slot value inside a reactive accessor                             |
| `isPyreonComponent`        | Function  | Discriminate a component reference from a reactive accessor                 |
| `hoistNonReactStatics`     | Function  | Copy non-framework statics between components                               |
| `useStableValue`           | Hook      | Referentially stable value (identity changes only on deep inequality)       |
| `merge`                    | Function  | Deep merge of plain objects                                                 |
| `omit`                     | Function  | Copy without keys (descriptor-preserving)                                   |
| `pick`                     | Function  | Copy only keys (descriptor-preserving)                                      |
| `get`                      | Function  | Get nested value by dot/bracket path                                        |
| `set`                      | Function  | Set nested value by path (prototype-pollution-safe)                         |
| `throttle`                 | Function  | Throttle a function (`leading`/`trailing`, `.cancel()`)                     |
| `isEqual`                  | Function  | Deep structural equality                                                    |
| `isEmpty`                  | Function  | Check if a value is empty                                                   |
| `HTML_TAGS`                | Array     | All valid HTML tag names                                                    |
| `HTML_TEXT_TAGS`           | Array     | Text-content HTML tags                                                      |

### Types

| Type                          | Description                                                              |
| ----------------------------- | ------------------------------------------------------------------------ |
| `PyreonUIProps`               | Props of `PyreonUI`                                                      |
| `ThemeMode`                   | `'light' \| 'dark'` (resolved mode)                                     |
| `ThemeModeInput`              | `'light' \| 'dark' \| 'system'` (the `mode` prop input)                 |
| `CoreContextValue`            | `{ theme, mode, isDark, isLight }` — the internal context shape         |
| `CSSEngineConnector`          | Shape of the CSS-in-JS engine (`css`, `styled`, `keyframes`)            |
| `CssVariablesConfig`          | `{ prefix?, attribute? }` — CSS-variables options                       |
| `ResolvedCssVariablesConfig`  | `{ enabled, prefix, attribute }` — defaulted config                     |
| `CssVariablesPrePaintOptions` | `{ attribute?, storageKey?, fallback? }` for the pre-paint script        |
| `Breakpoints`                 | Breakpoint size map (e.g. `{ sm: 576, md: 768 }`)                       |
| `BreakpointKeys`              | Key union of `Breakpoints`                                              |
| `HTMLTags`                    | Union of all valid HTML tag names                                       |
| `HTMLTextTags`                | Union of text-content HTML tags                                         |
| `HTMLElementAttrs`            | Per-tag attribute map                                                   |
| `HTMLTagAttrsByTag<T>`        | Attribute shape for a given tag `T`                                     |
| `Render`                      | Type of the `render` helper                                             |
| `IsEmpty`                     | Type of the `isEmpty` helper                                            |

## Key Features

- `PyreonUI({ theme, mode, inversed })` — single provider replacing the old theme + mode + config split; calls `init()` internally.
- `mode="system"` auto-detects the OS preference via `matchMedia` and updates reactively, with one document-lifetime subscription shared across all `useMode()` readers.
- `useMode()` returns the resolved `'light' \| 'dark'` mode as a reactive signal, honoring `system` and `inversed`.
- `init({ cssVariables: true })` opts into CSS-variables theming — a dark/light flip is one `documentElement` attribute write with zero re-resolution or className churn.
- `cssVariablesPrePaintScript()` builds the blocking `<head>` script that prevents the dark-mode flash before first paint.
- `init()` is callable directly for tests and SSR-without-`PyreonUI` environments.
- Zero-dependency utilities (`get`, `set`, `merge`, `pick`, `omit`, `throttle`, `isEmpty`, `isEqual`) and slot/composition helpers (`render`, `resolveSlot`, `compose`, `hoistNonReactStatics`, `useStableValue`).
- `HTML_TAGS` / `HTML_TEXT_TAGS` constants drive Element / Text base tag dispatching.
