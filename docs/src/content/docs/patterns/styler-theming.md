---
title: "Styling and theming — styled + PyreonUI"
summary: "styled() for CSS-in-JS, PyreonUI for theme + mode, a named .multiple() modifier for a one-off look. Never init() manually in app code, never pass CSS through props."
seeAlso: [reactive-context]
---

## The pattern

Wrap the app in `PyreonUI` (from `@pyreon/ui-core`) to provide theme + light/dark mode + config in one provider:

```tsx
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from './theme'   // your own theme object (colors, spacing, …)

<PyreonUI theme={theme} mode="system">
  <App />
</PyreonUI>
```

`mode` accepts `"light" | "dark" | "system"`. `"system"` reads `prefers-color-scheme` and tracks live; `useMode()` returns the resolved mode (`'light' | 'dark'`) as a plain value — call it inside a reactive scope to track changes.

Inline component styles with `styled`:

```tsx
import { styled } from '@pyreon/styler'

const Button = styled('button')`
  padding: 8px 16px;
  background: ${(p) => p.theme.colors.primary};
  color: white;
  border-radius: 6px;

  &:hover {
    background: ${(p) => p.theme.colors.primaryDark};
  }
`

const Example = () => <Button onClick={() => console.log('click')}>Click me</Button>
```

Or use `css` for shared snippets + `keyframes` for animations:

```ts
import { css, keyframes } from '@pyreon/styler'

const pulse = keyframes`
  from { opacity: 0.5 }
  to   { opacity: 1   }
`

const flash = css`
  animation: ${pulse} 500ms ease infinite alternate;
`
```

Switch theme at runtime by passing a different theme prop to `PyreonUI`. `ThemeContext` is a reactive context, but a PLAIN `styled()` component only picks up the swap automatically when it's driven through `@pyreon/rocketstyle` or `@pyreon/elements` (both pass their dimension/layout props as reactive accessors, which is what wires the theme-tracking `computed()` internally — see [styler's Theming docs](/docs/styler#theming) for the exact mechanism). A hand-written `styled()` component used directly resolves its CSS once at mount and needs a remount (e.g. behind a `<Show>`/accessor keyed on the theme) to pick up a later swap.

## One-off looks: add a modifier, do not pass styles

On a rocketstyle component (every `@pyreon/ui-components` component, and any `Element`-based chain), never pass CSS at the call site (`css="…"`, `style={{ padding: 4 }}`). Give the component a named, typed modifier with the multi-value `.multiple()` dimension and apply it by name:

```tsx
const Grid = BaseGrid.multiple({
  threeUp: { gridTemplateColumns: { md: 'repeat(3, minmax(0, 1fr))' } },
  dense: { gap: 8 },
})

const one = <Grid multiple="threeUp" />
const both = <Grid multiple={['threeUp', compact() && 'dense']} />   // falsy entries are skipped
```

A modifier takes everything a `.theme()` value takes (single value, mobile-first array, breakpoint object, `mode(light, dark)`, `hover` / `focus` / `active` / `disabled` groups), its keys are type-checked, and it is merged over the theme, so it always wins over `.theme()` and over `state` / `size` / `variant`. A responsive modifier wins from its first breakpoint up and keeps the theme's value below it. A signal-driven list swaps the class on the same node.

- A **caller-chosen value** (a column count, a padding step) is a `.params()` param: a mapper from one value to a theme slice, typed and responsive at the call site.

```tsx
const Grid = BaseGrid.params({ columns: (n: number) => ({ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }) })

const responsive = <Grid columns={{ xs: 1, md: 3 }} />   // the mapper sees 1, then 3
```
- A **product-wide look** is a variant (`.variants()`).
- `css` stays as the escape hatch for a selector or an at-rule, written as a tagged template or callback (a raw string does not type-check), with a lint suppression saying why. `pyreon/prefer-style-modifier` flags it; `pyreon/no-raw-css-string` errors on raw CSS text.
- Under `rocketstyle({ useBooleans: true })` a modifier is also a boolean prop (`<Grid threeUp />`); Pyreon's own factories use the default `useBooleans: false`.

## Why

- **PyreonUI** replaces 3 separate providers (theme / mode / config) with one. It internally calls `init()` to wire the CSS engine, so app code never needs to.
- **`styled` is reactive when rocketstyle/elements-driven** — the theme argument is a snapshot at call time for a plain `styled()` call, but `@pyreon/ui-components` (built on rocketstyle) re-resolves on a whole-theme swap without remount, because rocketstyle threads its dimension/theme reads through a `computed()` styler tracks.
- **FNV-1a hashing + dedup cache** — repeated `styled` templates with the same CSS resolve to the same class, so identical buttons share one class on the page.

## Anti-pattern

```tsx
// BROKEN — CSS through a prop: unchecked text, no theme, restated per call site
const a = <Card css="padding: 4px; background: #fafafa;" />
const b = <Card style={{ padding: 4 }} />

// Correct — a named modifier on the component
const CompactCard = Card.multiple({ compact: { padding: 4, backgroundColor: '#fafafa' } })
const c = <CompactCard multiple="compact" />
```

```tsx
// BROKEN — calling init() in app code
import { init } from '@pyreon/ui-core'
init({ styled, css })     // PyreonUI does this internally; duplicate calls
                          // risk conflicting configs

// Correct:
const Root = () => (
  <PyreonUI theme={theme}>
    <App />
  </PyreonUI>
)
```

```tsx
// BROKEN — augmenting rocketstyle's ThemeDefault when a theme library you
// depend on already did (causes TS2320 "cannot simultaneously extend")
declare module '@pyreon/rocketstyle' {
  interface ThemeDefault extends MyCustomTheme {}
}

// Correct — when the library already augments, consumer code reads the
// augmented type directly without re-declaring it.
```

```tsx
// BROKEN — reading `theme` with destructure loses reactivity
const { colors } = useTheme()
// If the theme swaps, `colors` is stale.

// Correct — call the accessor inside reactive scopes:
const getTheme = useThemeAccessor()
return <div style={() => ({ color: getTheme().colors.primary })}>...</div>
```

## Related

- Reference API: `PyreonUI`, `styled`, `css`, `keyframes` — `get_api`
- Pattern: `reactive-context` for the theme's underlying reactive context pattern
- Anti-pattern: "Duplicate module augmentation" in `architecture` category
