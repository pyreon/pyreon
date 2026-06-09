# @pyreon/ui-core

Foundation layer for Pyreon's UI system — `PyreonUI` provider, config singleton, utilities.

`@pyreon/ui-core` is the cross-cutting layer that ties Pyreon's UI packages (`styler`, `unistyle`, `elements`, `rocketstyle`, `coolgrid`, …) together. It ships the unified `<PyreonUI>` provider (theme + light/dark/system mode in one component), the `config` styling-engine singleton (a thin facade over `@pyreon/styler`), helper utilities (`omit` / `pick` / `merge` / `compose` / `throttle` / `set` / `get` / `isEmpty` / `isEqual` / `hoistNonReactStatics`), and the canonical HTML tag arrays + types. No external utility deps — every helper is built-in with prototype-pollution protection where it matters.

## Install

```bash
bun add @pyreon/ui-core @pyreon/core @pyreon/styler
```

## Quick start

```tsx
import { PyreonUI, useMode } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'

<PyreonUI theme={theme} mode="system">
  <App />
</PyreonUI>

// In any descendant:
function ModeAware() {
  const mode = useMode()              // "light" | "dark" — reactive
  return <span>Current mode: {mode}</span>
}
```

## `<PyreonUI>` — unified provider

Single provider that replaces the previous trio of theme / mode / config providers.

```tsx
<PyreonUI
  theme={theme}                       // Theme object (breakpoints, rootSize, custom keys)
  mode="light"                        // "light" | "dark" | "system" — also accepts () => mode
  inversed                            // Flip mode for a nested section (dark sidebar in light app)
>
  <App />
</PyreonUI>
```

- `mode="system"` — auto-detects OS dark mode via `matchMedia('(prefers-color-scheme: dark)')` and updates reactively when the user changes their OS preference.
- `inversed` — flips the resolved mode for the subtree (e.g. a dark hero on a light page).
- `mode` accepts a signal accessor — `<PyreonUI mode={() => userPref()}>` re-renders the entire subtree's CSS on change WITHOUT remounting (the theme is wrapped in `computed()`).
- `PyreonUI` calls `init()` internally — you don't normally need to call it yourself.

`PyreonUI` is marked `nativeCompat` so it works correctly inside compat-mode apps (`@pyreon/{react,preact,vue,solid,svelte}-compat`) — its `provide()` calls land in Pyreon's setup frame, not inside the compat wrapper.

## `useMode()`

Reactive — returns `'light'` or `'dark'`, updates on `mode` prop changes AND OS preference changes (when `mode="system"`).

```ts
const mode = useMode()
```

## `config` — styling engine singleton

```ts
import { config } from '@pyreon/ui-core'

const { styled, css, keyframes } = config
```

Pyreon uses `@pyreon/styler` directly — `config` is a thin facade exposed for symmetry across the UI packages. `init()` is the (idempotent) bootstrap call `PyreonUI` invokes internally.

## Utility helpers

### `compose(...fns)` — right-to-left function composition

```ts
const transform = compose(toUpperCase, trim, normalize)
transform('  hello  ')  // 'HELLO'
```

### `render(value)` — flexible value/element renderer

Handles components, primitives, arrays, null. Useful when authoring helper components that accept a polymorphic content prop.

```ts
render('hello')           // 'hello'
render(MyComponent)       // MyComponent({})
render(null)              // null
```

### `isEmpty(value)` / `isEqual(a, b)`

Type-safe checks. `isEmpty` returns `true` for `null`, `undefined`, `{}`, `[]`, and non-object primitives. `isEqual` performs a deep structural compare.

```ts
isEmpty({})           // true
isEmpty([])           // true
isEmpty({ a: 1 })     // false
isEqual({a:1}, {a:1}) // true
```

### `omit(obj, keys)` / `pick(obj, keys)`

Object key filtering. Accept nullable inputs. **`omit()` also accepts a pre-built `Set<string>`** for hot paths where the same key list is reused across many calls (used by rocketstyle to avoid per-mount Set allocation):

```ts
omit({ a:1, b:2, c:3 }, ['b'])      // { a:1, c:3 }
pick({ a:1, b:2, c:3 }, ['a','b'])  // { a:1, b:2 }

const omitSet = new Set(['b','c'])
omit({ a:1, b:2, c:3 }, omitSet)    // { a:1 }
```

### `set(obj, path, value)` / `get(obj, path, default?)`

Nested property access by dot/bracket path. **`set` blocks prototype pollution** — `__proto__`, `constructor`, `prototype` keys are silently ignored.

```ts
const o = {}
set(o, 'a.b.c', 42)               // { a: { b: { c: 42 } } }
get(o, 'a.b.c')                   // 42
get(o, 'a.x', 'default')          // 'default'
```

### `merge(...objects)` — left-to-right deep merge

Only plain objects are recursed; arrays are replaced wholesale. Prototype-pollution keys are blocked.

```ts
merge({ a: { x: 1 } }, { a: { y: 2 } })  // { a: { x: 1, y: 2 } }
```

### `throttle(fn, ms)`

Limits execution to at most once per window. Returns a function with `.cancel()`.

```ts
const onResize = throttle(handleResize, 200)
window.addEventListener('resize', onResize)
// onResize.cancel()
```

### `useStableValue(value)`

Returns a stable accessor that emits only when the input changes by `isEqual`. Useful for deriving signal-shaped values from props that may re-construct identical objects every render.

### `hoistNonReactStatics(target, source)`

Standard "hoist non-React statics" copy — used by HOC factories so wrapped components retain their static methods + display names.

## HTML tag constants

```ts
import { HTML_TAGS, HTML_TEXT_TAGS, HTMLTags, HTMLTextTags } from '@pyreon/ui-core'

HTML_TAGS         // array of 100+ valid HTML tag names
HTML_TEXT_TAGS    // text-content tags: h1-h6, p, span, strong, em, ...
type Tag = HTMLTags        // narrowed union type
type TextTag = HTMLTextTags
```

Used by `@pyreon/elements` to constrain the `tag` prop and by the styler's `as` polymorphism.

## Types

```ts
import type {
  BreakpointKeys, Breakpoints,
  CoreContextValue,
  HTMLElementAttrs, HTMLTagAttrsByTag, HTMLTags, HTMLTextTags,
  IsEmpty,
  PyreonUIProps, ThemeMode, ThemeModeInput,
  Render,
} from '@pyreon/ui-core'
```

## Gotchas

- **`<PyreonUI>` is the canonical app-root provider.** Internal sub-providers (`CoreProvider` / `UnistyleProvider` / `ThemeProvider` / `Provider` from rocketstyle / `OverlayContextProvider`) are marked `nativeCompat` even though they're internal — never mount a sub-provider manually if `<PyreonUI>` is already in the tree.
- **`set` / `merge` silently drop prototype-pollution keys.** If a user-supplied key matches `__proto__` / `constructor` / `prototype` it is ignored. Don't rely on these utilities for arbitrary JSON merging that might intentionally need those keys.
- **`omit` with a Set is faster than with an array** only at scale. For one-off calls the array form is fine.
- **`useMode()` is reactive — call inside a tracking scope** (JSX expression, effect, computed). Reading at component setup top-level captures the initial value.

## Documentation

Full docs: [docs.pyreon.dev/docs/ui-core](https://docs.pyreon.dev/docs/ui-core) (or `docs/src/content/docs/ui-core.md` in this repo).

## License

MIT
