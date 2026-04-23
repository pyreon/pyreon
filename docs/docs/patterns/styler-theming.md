---
title: "Styling and theming — styled + PyreonUI"
summary: "styled() for CSS-in-JS, PyreonUI for theme + mode. Never init() manually in app code."
seeAlso: [reactive-context]
---

# Styling and theming — styled + PyreonUI

## The pattern

Wrap the app in `PyreonUI` (from `@pyreon/ui-core`) to provide theme + light/dark mode + config in one provider:

```tsx
import { PyreonUI } from '@pyreon/ui-core'
import theme from '@pyreon/ui-theme'

<PyreonUI theme={theme} mode="system">
  <App />
</PyreonUI>
```

`mode` accepts `"light" | "dark" | "system"`. `"system"` reads `prefers-color-scheme` and tracks live; `useMode()` returns the resolved mode as a signal.

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

Switch theme at runtime by passing a different theme prop to `PyreonUI` — the resolver effect in `styled()` re-resolves CSS and swaps class names without remounting the VNode.

## Why

- **PyreonUI** replaces 3 separate providers (theme / mode / config) with one. It internally calls `init()` to wire the CSS engine, so app code never needs to.
- **`styled` is reactive** — the theme argument is a snapshot at call time, but the underlying `ThemeContext` is a reactive context, so whole-theme swaps re-resolve without remount.
- **FNV-1a hashing + dedup cache** — repeated `styled` templates with the same CSS resolve to the same class, so identical buttons share one class on the page.

## Anti-pattern

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
// BROKEN — augmenting ThemeDefault when @pyreon/ui-theme already did
// (declares types, causes TS2320 "cannot simultaneously extend")
declare module '@pyreon/styler' {
  interface ThemeDefault extends MyCustomTheme {}
}

// Correct — the library already augments; consumer code reads the
// augmented type directly without re-declaring it.
```

```tsx
// BROKEN — reading `theme` with destructure loses reactivity
const { colors } = useTheme()
// If the theme swaps, `colors` is stale.

// Correct — call the accessor inside reactive scopes:
const getTheme = useThemeAccessor()
return <div style={{ color: () => getTheme().colors.primary }}>...</div>
```

## Related

- Reference API: `PyreonUI`, `styled`, `css`, `keyframes` — `get_api`
- Pattern: `reactive-context` for the theme's underlying reactive context pattern
- Anti-pattern: "Duplicate module augmentation" in `architecture` category
