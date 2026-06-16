# @pyreon/unistyle

Responsive CSS engine — property-centric theme objects, automatic media queries, breakpoint dedup.

`@pyreon/unistyle` transforms theme objects (`{ padding: { xs: 8, md: 16 }, fontSize: 14 }`) into breakpoint-centric CSS with mobile-first media queries. Automatic px→rem conversion, 170+ CSS property mappings, three input shapes per property (scalar / mobile-first array / breakpoint object), and an optimizer that emits only the per-breakpoint DELTAS — so a property set at `xs` doesn't re-emit at every larger breakpoint. Powers the responsive system behind `@pyreon/elements`, `@pyreon/coolgrid`, and `@pyreon/rocketstyle`. Per-theme cached so re-renders against the same theme reference return the previous output verbatim.

## Install

```bash
bun add @pyreon/unistyle @pyreon/core @pyreon/reactivity @pyreon/ui-core
```

## Quick start

```tsx
import { Provider, breakpoints } from '@pyreon/unistyle'

<Provider theme={breakpoints}>
  <App />
</Provider>
```

Or with a custom theme:

```tsx
<Provider
  theme={{
    rootSize: 16,
    breakpoints: { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1440 },
  }}
>
  <App />
</Provider>
```

`Provider` is also re-exported from `@pyreon/coolgrid` and `@pyreon/elements` — set it once near the app root (typically `<PyreonUI>` wraps it automatically).

## `makeItResponsive` — the core engine

Reads a theme prop off styled-component props, runs the responsive pipeline, and returns CSS with media-query wrappers.

```ts
import { makeItResponsive, styles } from '@pyreon/unistyle'
import { css } from '@pyreon/styler'
import { styled } from '@pyreon/styler'

const Box = styled('div')`
  ${makeItResponsive({ key: '$box', css, styles })}
`

// Scalar
<Box $box={{ padding: 16, fontSize: 14 }} />

// Breakpoint object
<Box $box={{ padding: { xs: 8, md: 16, lg: 24 }, fontSize: 14 }} />

// Mobile-first array
<Box $box={{ padding: [8, 16, 24], fontSize: 14 }} />
```

**Pipeline:**

```text
theme object
   ↓  normalize (fill gaps so every breakpoint has a complete set)
   ↓  transform (property-centric → breakpoint-centric pivot)
   ↓  optimize (drop declarations that don't change vs previous breakpoint)
   ↓  emit @media rules
```

| Param | Type | Notes |
|---|---|---|
| `key` | `string` | Theme prop name to read from props |
| `css` | `function` | `css` tagged template from `@pyreon/styler` |
| `styles` | `function` | Style processor (use the exported `styles`) |
| `normalize` | `boolean` | Fill missing breakpoints by inheriting from previous (default `true`) |

`makeItResponsive` carries a **render-output cache** keyed by theme reference — the same `(internalTheme, outerTheme)` pair returns the previous CSSResult array verbatim. Re-renders against a stable provider cost ~0.

## `styles` — data-driven CSS processor

Reads a theme object and outputs CSS for 170+ recognized properties — layout, spacing, typography, borders, backgrounds, transforms, special keys (`fullScreen`, `clearFix`, `extendCss`, `backgroundImage`, `animation`). Used internally by `makeItResponsive`; callable directly when you have a non-responsive theme.

```ts
import { styles } from '@pyreon/unistyle'

const cssResult = styles({ theme, css, rootSize: 16 })
```

Supports shorthand expansion (`margin: 16` → `margin: 1rem`; `padding: '12 16'` → top/bottom/left/right), property-first naming (`borderWidthTop`, not CSS-spec `borderTopWidth`), and numeric→rem auto-conversion.

## Responsive value formats

Every property accepts three shapes:

```ts
// Scalar — applies at every breakpoint
{ padding: 16 }

// Mobile-first array — positional [xs, sm, md, lg, xl, xxl]
{ padding: [8, 12, 16] }     // xs: 8, sm: 12, md: 16, fills above

// Object — explicit breakpoint keys
{ padding: { xs: 8, md: 16, xl: 24 } }
```

With `normalize: true` (default), missing breakpoints inherit from the previous one. The optimizer then DROPS declarations that don't actually change vs the previous breakpoint — so `{ color: { xs: 'red', sm: 'red' }, padding: { xs: 0, sm: '1rem' } }` emits only `padding: 1rem` at `@media (min-width: sm)`, not `color: red; padding: 1rem;`.

## Unit conversion

```ts
import { value, values, stripUnit } from '@pyreon/unistyle'

value(16)              // '1rem'    (16 / 16)
value(24)              // '1.5rem'
value(0)               // '0'       (always unitless)
value('2em')           // '2em'     (string passthrough)
value(16, 16, 'px')    // '16px'    (output-unit override)

stripUnit('24px')           // 24
stripUnit('24px', true)     // [24, 'px']
stripUnit(24)               // 24

values([null, 16, 24], 16)  // '1rem' (picks first non-null and converts)
```

## CSS variables from a theme — `themeToCssVars`

Autogenerate CSS custom properties from a plain theme JSON. Returns the same-shape tree with every eligible leaf replaced by a `var(--px-…)` reference string, plus a ready-to-inject `:root` block and a `varName → value` registry for consumers that can't evaluate `var()` (document export, devtools).

```ts
import { themeToCssVars } from '@pyreon/unistyle'

const theme = { rootSize: 16, spacing: { small: 8 }, ratio: { medium: 1.5 } }
const { vars, css, registry } = themeToCssVars(theme)

vars.spacing.small                  // 'var(--px-spacing-small)'
css                                 // ':root {\n  --px-spacing-small: 0.5rem;\n  --px-ratio-medium: 1.5;\n}'
registry.get('--px-spacing-small')  // '0.5rem'

// Proportional sizing is native CSS — no extra machinery:
const width = `calc(${vars.spacing.small} * ${vars.ratio.medium})`
```

Key behaviors:

- **Units are baked at emission** using the same `value()` conversion the pipeline applies at render time — `spacing.small: 8` emits `--px-spacing-small: 0.5rem`, so themes stay authored in pixels and nothing downstream ever converts a var.
- **Conventional length keys convert by default** (`spacing`, `fontSize`, `headingSize`, `elementSize`, `borderRadius` → rem; `borderWidth` → px). Everything else emits verbatim, so unitless scales (`lineHeight`, `fontWeight`, `zIndex`, custom `ratio` keys) stay valid as `calc()` multipliers. Opt custom scales into conversion via `units: { myScale: 'rem' }`.
- **`breakpoints` / `rootSize` / `__PYREON__` are excluded** — `@media` queries can't read `var()`; JS consumes them at render time. Arrays, functions, booleans, `null`/`undefined`, empty strings, and non-finite numbers also stay raw.
- **Var leaves flow through the whole pipeline untouched** — `value()`, `values()`, the edge/border-radius shorthands, `styles()`, and `makeItResponsive` all pass `var(`/`calc(` strings through verbatim (a tested contract, not an accident).
- **Pure + cached** — no injection happens; pass `css` to your style sink. Results are WeakMap-cached by theme identity, so repeated calls return the same object.

Gotchas: don't do JS arithmetic on a var leaf (`vars.spacing.small * 2` is `NaN` — use native `calc()`); don't use a var leaf for `backgroundImage` (CSS forbids `var()` inside `url(…)`); name collisions after kebab-case normalization (`xSmall` vs `x-small`) throw loudly.

## Alignment helpers

```ts
import { alignContent, ALIGN_CONTENT_MAP_X, ALIGN_CONTENT_MAP_Y, ALIGN_CONTENT_DIRECTION } from '@pyreon/unistyle'
```

Maps alignment keywords → CSS flex values:

| Keyword            | X-axis            | Y-axis            |
| ------------------ | ----------------- | ----------------- |
| `left` / `top`     | `flex-start`      | `flex-start`      |
| `center`           | `center`          | `center`          |
| `right` / `bottom` | `flex-end`        | `flex-end`        |
| `spaceBetween`     | `space-between`   | `space-between`   |
| `spaceAround`      | `space-around`    | `space-around`    |
| `block`            | `stretch`         | `stretch`         |

## Default breakpoints

```ts
import { breakpoints, enrichTheme } from '@pyreon/unistyle'

breakpoints  // { rootSize: 16, breakpoints: { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1440 } }
```

Values are converted to `em` units in media queries for correct cross-browser behaviour. `enrichTheme(userTheme)` merges your theme with the defaults — used by `<PyreonUI>` internally.

## Other exports

| Export | Notes |
|---|---|
| `createMediaQueries` | Builds breakpoint-name → tagged-template-function map |
| `transformTheme` | Property-centric → breakpoint-centric pivot |
| `normalizeTheme` | Fills gaps so every breakpoint has a complete set |
| `sortBreakpoints` | Sorts breakpoint definitions by value (ascending) |
| `extendCss` | Helper for processing `ExtendCss` props (string, fn, callback) |
| `Provider` / `context` | Theme context provider + consumer |
| `enrichTheme` | Merge user theme with default breakpoints/spacing |

## Types

```ts
import type {
  PyreonTheme, Breakpoints,
  ITheme, Styles, StylesTheme, ExtendCss,
  AlignContent, AlignContentAlignXKeys, AlignContentAlignYKeys, AlignContentDirectionKeys,
  BrowserColors, Color, PropertyValue, UnitValue, Value, Values,
  MakeItResponsive, MakeItResponsiveStyles, TransformTheme, NormalizeTheme, SortBreakpoints, CreateMediaQueries,
  StripUnit, Defaults, TProvider,
} from '@pyreon/unistyle'
```

## Performance

- **Per-theme render cache** — `makeItResponsive` carries a `WeakMap<innerTheme, WeakMap<outerTheme, CSSResult[]>>`. Same theme reference → previous output returned verbatim.
- **Key-to-index lookup** — `styles()` iterates ~10-20 descriptors per component (matched against the user's theme keys) instead of ~257 (full descriptor table). The index builder walks every branch's identifying field (`d.key` / `d.keys` / `d.id` for the `'special'` branch — `fullScreen`, `clearFix`, `extendCss`, `backgroundImage`, `animation`).
- **Module-level reusable containers** — `styles()` reuses module-scoped `Set<number>` and `fragments[]` containers cleared on each synchronous call, eliminating ~160 allocations per 80-component page.
- **Optimizer drops re-emitted declarations** — `optimizeBreakpointDeltas()` removes properties that don't change vs the previous breakpoint, cutting bytes in mobile-first responsive cascades.

## Gotchas

- **Conditional CSS in responsive callbacks needs an explicit else.** When `t.block` is responsive (`[true, false, true]`), a callback like `${t.block && 'align-self: stretch'}` emits `stretch` at the truthy breakpoints AND emits NOTHING at the falsy ones — the optimizer is subtractive and can't synthesize a reset. The cascade leaves `stretch` in place. Fix: always emit a value with an explicit else: `align-self: ${t.block ? 'stretch' : 'auto'}`. The optimizer drops both halves when nothing changes, so the always-emit pattern is free in the steady state.
- **CSS property naming follows unistyle convention** (`borderWidthTop` / `borderColorLeft`), NOT CSS-spec naming (`borderTopWidth`). Property-first.
- **`extendCss`** accepts string, function, or callback. The function form receives the resolved theme so you can derive from it.
- **`enrichTheme` merges; it does not replace.** Pass only the keys you want to override — defaults fill in the rest.

## Documentation

Full docs: [pyreon.dev/docs/unistyle](https://pyreon.dev/docs/unistyle) (or `docs/src/content/docs/unistyle.md` in this repo).

## License

MIT
