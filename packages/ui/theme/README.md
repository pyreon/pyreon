# @pyreon/ui-theme

> **Private — internal to the Pyreon monorepo. Not published to npm.**

The default theme object for the `@pyreon/ui-components` library — colors, spacing, typography, borders, shadows, transitions, breakpoints — and the **global rocketstyle augmentation** that types every `.theme()` / `.states()` / `.sizes()` / `.variants()` callback's `t` parameter against this theme's shape. Importing this package once (typically from your app entry) is what makes `t.color.system.primary.base` type-check inside every rocketstyle component definition in the codebase.

## Quick start

```tsx
import { PyreonUI } from '@pyreon/ui-core'
import theme from '@pyreon/ui-theme'
import { Button } from '@pyreon/ui-components'

;<PyreonUI theme={theme} mode="system">
  <Button state="primary" size="medium">
    Save
  </Button>
</PyreonUI>
```

The default `theme` is the only runtime export. Type augmentation runs as a side effect of importing this package; the `import '@pyreon/ui-theme'` (or any import that pulls it into the graph — including `import theme from '@pyreon/ui-theme'`) is what activates it.

## Exports

| Export                   | Description                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| `theme` (default export) | The default theme object. Frozen-shape (`as const`) so its literal types flow through to consumers. |
| `Theme` (type)           | `typeof theme` — the exact theme shape. Use for typing custom theme overrides.                      |

```ts
import theme, { type Theme } from '@pyreon/ui-theme'
```

## Theme shape

The full object is in [`src/theme.ts`](./src/theme.ts). Top-level keys:

| Key            | Description                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| `rootSize`     | Root font size (px) — `16`. Used by `@pyreon/unistyle`'s rem helpers.                                            |
| `breakpoints`  | `{ xs: 0, sm: 576, md: 768, lg: 992, xl: 1200 }` — the responsive grid.                                          |
| `spacing`      | `reset` (0) / `xxxSmall` (1) … `xxxLarge` (32) — px-valued spacing scale.                                        |
| `fontFamily`   | `base` (Inter + system sans-serif) and `mono` (JetBrains Mono + monospaces).                                     |
| `fontSize`     | `xSmall` (10) … `xxLarge` (24) — px-valued font scale.                                                           |
| `headingSize`  | `level1` (32) … `level6` (12) — heading-only font scale.                                                         |
| `fontWeight`   | `light` (300), `base` (400), `medium` (500), `semibold` (600), `bold` (700).                                     |
| `lineHeight`   | `reset` (1), `small` (1.25), `base` (1.5), `large` (1.75).                                                       |
| `elementSize`  | `xxSmall` (12) … `xxxLarge` (48) — height for buttons, inputs, etc.                                              |
| `borderWidth`  | `base` (1), `medium` (2), `large` (4).                                                                           |
| `borderStyle`  | `base: 'solid'`, `dashed: 'dashed'`.                                                                             |
| `borderRadius` | `reset` (0), `small` (2), `base` (4), `medium` (8), `large` (12), `xLarge` (16), `circle: '50%'`, `pill` (9999). |
| `shadows`      | `small` / `base` / `medium` / `large` — drop-shadow scale.                                                       |
| `zIndex`       | `base` (10), `popover` (`{ overlay: 100, content: 101 }`), `drawer` (2000/2001), `modal` (3000/3001).            |
| `transition`   | `fast` (`all .1s`), `base` (`all .15s`), `slow` (`all .3s`).                                                     |
| `color.system` | Semantic palette — see below.                                                                                    |

### Color palette

Under `color.system` each color carries `base` (full opacity) + `text` (where applicable) + opacity ramps `50` / `100` / `200` / `300` / `400` / `500` / `600` / `700` / `800` / `900`. Palettes:

- `transparent` — `'transparent'` literal
- `light` — white with opacity ramp
- `dark` — slate-900 with opacity ramp
- `base` — slate-400 with opacity ramp (neutral grays)
- `primary` — blue-500 + `text: '#1e40af'`
- `success` — emerald-500 + `text: '#065f46'`
- `info` — sky-500 + `text: '#0c4a6e'`
- `error` — red-500 + `text: '#991b1b'`
- `warning` — amber-500 + `text: '#92400e'`

```ts
t.color.system.primary.base // 'rgba(59, 130, 246, 1)'
t.color.system.primary.text // '#1e40af'
t.color.system.primary[200] // 'rgba(59, 130, 246, 0.2)'
t.color.system.transparent // 'transparent'
```

## Global type augmentation

This package globally augments two rocketstyle interfaces so EVERY rocketstyle component in the project type-checks against this theme:

```ts
// src/index.ts (this package)
declare module '@pyreon/rocketstyle' {
  interface ThemeDefault extends Theme {}
  interface StylesDefault extends ITheme {}
}
```

- `ThemeDefault` — the type of `t` in `.theme()` / `.states()` / `.sizes()` / `.variants()` callbacks.
- `StylesDefault` — the type of CSS property names (from `@pyreon/unistyle`'s `ITheme`), so `borderWidthTop` typechecks and `borderTopWidth` doesn't.

**Consumer apps MUST NOT re-augment these interfaces.** Re-declaring `ThemeDefault` in your app's `pyreon.d.ts` triggers `TS2320: Interface incorrectly extends...`. The library handles it once; the app inherits it.

## Custom themes

There is no `createTheme()` factory in this package — extend the default theme by spreading:

```ts
import theme, { type Theme } from '@pyreon/ui-theme'

const myTheme: Theme = {
  ...theme,
  color: {
    ...theme.color,
    system: {
      ...theme.color.system,
      primary: {
        ...theme.color.system.primary,
        base: 'rgba(139, 92, 246, 1)',      // violet-500
        text: '#5b21b6',
      },
    },
  },
}

<PyreonUI theme={myTheme}>…</PyreonUI>
```

Because `theme` is `as const`, deep spreads preserve the literal types — the resulting `myTheme` still satisfies `Theme` and every rocketstyle component continues to type-check.

## Mode (light / dark)

`@pyreon/ui-theme` itself ships ONE theme — it does NOT split into separate light / dark trees. Mode resolution happens at the `@pyreon/ui-core` `PyreonUI` provider:

```tsx
<PyreonUI theme={theme} mode="light">…</PyreonUI>
<PyreonUI theme={theme} mode="dark">…</PyreonUI>
<PyreonUI theme={theme} mode="system">…</PyreonUI>    // matches OS prefers-color-scheme
<PyreonUI theme={theme} mode="light" inversed>…</PyreonUI>  // flips
```

`useMode()` returns the resolved mode signal — rocketstyle components can branch on it via the `useDarkMode` dimension. The semantic colors in `system.*` are mode-neutral by design (blue is blue regardless); contrast adjustment happens at the rocketstyle component layer (e.g. `.states()` callbacks reading `useDarkMode`).

## Gotchas

- **No `createTheme`. No `defaultTheme`.** Earlier docs referenced these; they don't exist. The package's only runtime export is the default `theme`.
- **Don't re-augment `ThemeDefault` / `StylesDefault` in your app.** This package owns the augmentation. Re-declaring them in a consumer `pyreon.d.ts` triggers `TS2320`.
- **CSS property naming follows `@pyreon/unistyle`** — `borderWidthTop` not `borderTopWidth`. Property-first.
- **`theme` is `as const`.** This is load-bearing — it's what lets literal numeric values (spacing, fontSize) widen to `number` only where intentional, and what lets the global augmentation pass the strict shape into `ThemeDefault`. Don't reshape `theme` at module scope.

## License

MIT (private to the Pyreon monorepo).
