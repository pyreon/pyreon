---
title: "Styling & Theming"
description: "How to style Pyreon components with @pyreon/styler (CSS-in-JS), build multi-state components with rocketstyle, go responsive with unistyle, and theme everything with PyreonUI."
---

# Styling & Theming

Pyreon's UI system layers cleanly: **styler** (CSS-in-JS primitives) → **unistyle** (responsive props) → **rocketstyle** (multi-dimensional themed components) → **PyreonUI** (the unified theme + mode provider). Theme is a reactive context, so a whole-theme swap re-resolves CSS and swaps class names without remounting.

## When to use what

- One-off styled element → `styled('div')` from `@pyreon/styler`.
- Responsive values (mobile-first arrays / breakpoint objects) → `@pyreon/unistyle`.
- A reusable component with `state` / `size` / `variant` / dark-mode dimensions → `@pyreon/rocketstyle`.
- App-wide theme + light/dark → wrap once in `PyreonUI`.

## styler — CSS-in-JS

```tsx
import { styled, css, keyframes } from '@pyreon/styler'

const Button = styled('button')`
  padding: 8px 16px;
  background: ${(t) => t.theme.colors.primary};
  border-radius: 4px;
`
```

`styled('tag')` returns a component; `css` (a tagged template) is a lazy `CSSResult`; `keyframes` returns an animation name string. `useTheme()` returns a theme snapshot; `useThemeAccessor()` returns the raw `() => Theme` accessor for tracking inside effects.

Dynamic, signal-driven styling, live:

<Example file="./examples/styler/dynamic-styling" />

## unistyle — responsive props

Values can be a single value, a mobile-first array, or a breakpoint object:

```tsx
// padding: 8px on xs, 16px from md up
<Box padding={[8, 8, 16]} />
<Box padding={{ xs: 8, md: 16 }} />
```

Live breakpoint detection:

<Example file="./examples/unistyle/live-breakpoint-detection" />

## rocketstyle — multi-state components

Dimensions (`state`, `size`, `variant`, theme, dark mode) map prop values to CSS. **Layout props go in `.attrs()`; CSS goes in `.theme()`.** The default is `useBooleans: false` — dimension props take **string** values:

```tsx
import { rocketstyle } from '@pyreon/rocketstyle'

const Button = rocketstyle('button')
  .attrs({ tag: 'button' })                    // layout: tag, direction, gap…
  .states({
    primary: (t) => ({ background: t.colors.primary, color: 'white' }),
    danger: (t) => ({ background: t.colors.danger, color: 'white' }),
  })
  .sizes({
    small: () => ({ padding: '4px 8px' }),
    large: () => ({ padding: '12px 24px' }),
  })

// usage — string values, not booleans:
<Button state="primary" size="large">Save</Button>
```

`:hover` / `:focus` / `:active` / `:disabled` are written as objects inside `.theme()` callbacks. Opt into vitus-labs-style boolean shorthand with `rocketstyle({ useBooleans: true })`.

## Theming with PyreonUI

```tsx
import { PyreonUI } from '@pyreon/ui-core'

<PyreonUI theme={myTheme} mode="system">
  <App />
</PyreonUI>
```

`mode` is `"light" | "dark" | "system"` (system auto-detects `prefers-color-scheme`); `useMode()` returns the resolved mode as a signal. Opt into CSS-variables mode with `init({ cssVariables: true })` — then a dark/light flip is a single `data-theme` attribute write with zero className churn.

## Common pitfalls

- **Putting CSS in `.attrs()` or layout in `.theme()`.** Layout (`tag`, `direction`, `gap`, `alignX/Y`, `block`) belongs in `.attrs()`; colors/spacing/borders/pseudo-states belong in `.theme()`.
- **Booleans when `useBooleans` is false (the default).** `<Button primary />` is silently dropped — write `<Button state="primary" />`.
- **CSS-spec property order.** Unistyle uses property-first names: `borderWidthTop`, not `borderTopWidth`.
- **Re-augmenting `ThemeDefault` / `StylesDefault` in an app.** `@pyreon/ui-theme` already augments them — a second augmentation triggers TS2320. Remove the app-level one.

## Related

- [Styler reference](/docs/reference/styler) · [Rocketstyle guide](/docs/rocketstyle) · [Unistyle reference](/docs/reference/unistyle)
- [Styling & theming pattern](/docs/patterns/styler-theming)
- [Animations & Transitions](/docs/guides/animations)
