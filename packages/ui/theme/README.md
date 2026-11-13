# @pyreon/ui-theme

> **Private — internal to the Pyreon monorepo. Not published to npm.**

The default theme object for the `@pyreon/ui-components` library — colors, spacing, typography, borders, shadows, transitions, breakpoints — and the **global rocketstyle augmentation** that types every `.theme()` / `.states()` / `.sizes()` / `.variants()` callback's `t` parameter against this theme's shape. Importing this package once (typically from your app entry) is what makes `t.color.system.primary.base` type-check inside every rocketstyle component definition in the codebase.

## Quick start

```tsx
import { PyreonUI } from '@pyreon/ui-core'
import theme from '@pyreon/ui-theme'
import { Button } from '@pyreon/ui-components'

<PyreonUI theme={theme} mode="system">
  <Button state="primary" size="medium">Save</Button>
</PyreonUI>
```

Type augmentation runs as a side effect of importing this package; the `import '@pyreon/ui-theme'` (or any import that pulls it into the graph — including `import theme from '@pyreon/ui-theme'`) is what activates it.

## Exports

| Export | Description |
|---|---|
| `theme` (default export) | The default theme object. |
| `brandTheme` | The Pyreon brand theme: the default theme with ember primary, ink text on fills, Space Grotesk / JetBrains Mono and softer radii. See [Brand theme](#brand-theme). |
| `brandPackageDefaults` | The brand's look for charts, toast, flow and document, as the options those packages accept. See [Package defaults](#package-defaults). |
| `Theme` (type) | The theme contract: the default theme's shape with its values widened to `string` / `number`, so any theme with the same keys (for example `brandTheme`) is a `Theme`. |

```ts
import theme, { brandTheme, type Theme } from '@pyreon/ui-theme'
```

## Theme shape

The full object is in [`src/theme.ts`](./src/theme.ts). Top-level keys:

| Key | Description |
|---|---|
| `rootSize` | Root font size (px) — `16`. Used by `@pyreon/unistyle`'s rem helpers. |
| `breakpoints` | `{ xs: 0, sm: 576, md: 768, lg: 992, xl: 1200 }` — the responsive grid. |
| `spacing` | `reset` (0) / `xxxSmall` (1) … `xxxLarge` (32) — px-valued spacing scale. |
| `fontFamily` | `base` (Inter + system sans-serif) and `mono` (JetBrains Mono + monospaces). |
| `fontSize` | `xSmall` (10) … `xxLarge` (24) — px-valued font scale. |
| `headingSize` | `level1` (32) … `level6` (12) — heading-only font scale. |
| `fontWeight` | `light` (300), `base` (400), `medium` (500), `semibold` (600), `bold` (700). |
| `lineHeight` | `reset` (1), `small` (1.25), `base` (1.5), `large` (1.75). |
| `elementSize` | `xxSmall` (12) … `xxxLarge` (48) — height for buttons, inputs, etc. |
| `borderWidth` | `base` (1), `medium` (2), `large` (4). |
| `borderStyle` | `base: 'solid'`, `dashed: 'dashed'`. |
| `borderRadius` | `reset` (0), `small` (2), `base` (4), `medium` (8), `large` (12), `xLarge` (16), `circle: '50%'`, `pill` (9999). |
| `shadows` | `small` / `base` / `medium` / `large` — drop-shadow scale. |
| `zIndex` | `base` (10), `popover` (`{ overlay: 100, content: 101 }`), `drawer` (2000/2001), `modal` (3000/3001). |
| `transition` | `fast` (`all .1s`), `base` (`all .15s`), `slow` (`all .3s`). |
| `color.system` | Semantic palette — see below. |

### Color palette

Under `color.system` each color carries `base` (full opacity) and the opacity steps `50` … `900`. The five tones also carry the text roles below. Palettes:

- `transparent` — `'transparent'` literal
- `light` — white with opacity ramp
- `dark` — slate-900 with opacity ramp, plus `contrast: '#ffffff'` (text on a dark fill, e.g. Tooltip)
- `base` — slate-400 with opacity ramp (neutral grays)
- `primary` — blue-500 · `success` — emerald-500 · `info` — sky-500 · `error` — red-500 · `warning` — amber-500

Every tone has these roles. Each pair passes WCAG AA (4.5:1) in both modes, locked by `src/tests/contrast.test.ts`:

| Key | Use | Default theme |
|---|---|---|
| `base` | the solid fill | the tone at full opacity |
| `contrast` | text and glyphs ON `base` and ON `hover` | `#0f172a` for all five (white is 2.5–3.8:1 on these fills) |
| `hover` | the solid fill of a hovered `base` fill | the tone's 400 shade (`#60a5fa` for primary) |
| `text` | text in the tone on the light page and on the tone's tints `50`–`200` | `#1e40af`, `#065f46`, `#0c4a6e`, `#991b1b`, `#92400e` |
| `textDark` | the same, in dark mode (the page is `dark.base`) | the tone's 300 shade (`#93c5fd` for primary) |

```ts
t.color.system.primary.base       // 'rgba(59, 130, 246, 1)'
t.color.system.primary.contrast   // '#0f172a' — text on the fill
t.color.system.primary.text       // '#1e40af' — text in primary, light mode
t.color.system.primary[200]       // 'rgba(59, 130, 246, 0.2)'
```

In a component, `solidFill(t, tone)` (from `@pyreon/ui-components`' `factory.ts`) gives a fill with its `contrast` text and `hover` fill, and `tintText(t, m, tone)` gives `m(text, textDark)`.

- **Never put white on a fill without measuring.** White on blue-500 is 3.68:1, on emerald-500 2.54:1, on the brand's ember 3.06:1. Read `contrast`.
- **The opacity steps are not text colours.** `primary[700]` as text on `primary[100]` is about 2.3:1. Use `text` / `textDark`.
- **Hover is a solid colour, not `[800]`.** An opacity step is composited over the page, so it is lighter on a light page and darker on a dark one, and no single text colour passes on both.

## Brand theme

`brandTheme` is the Pyreon brand: pass it to `<PyreonUI theme={brandTheme}>` instead of `theme`. It keeps every key of the default theme and changes:

| | Brand value |
|---|---|
| `primary` | ember `#FF5E1A`; `contrast` ink `#0A0A0E` (6.46:1); `hover` `#FF7A3D`; `text` `#A8380A` / `textDark` `#FF8A4C` |
| `error` | `#DC2626` with white text (4.83:1), `hover` `#B91C1C`, `text` `#B91C1C` / `textDark` `#F87171` |
| `success` | `#15803D` with white text (5.02:1), `hover` `#166534`, `text` `#11692F` / `textDark` `#4ADE80` |
| `warning` | `#FACC15` with ink text, `hover` `#FDE047`, `text` `#8A5A00` / `textDark` `#FACC15` |
| `info` | `#22D3EE` with ink text, `hover` `#67E8F9`, `text` `#0A6E89` / `textDark` `#22D3EE` |
| `fontFamily` | `base`: Space Grotesk, `mono`: JetBrains Mono (system fallbacks). The theme names the fonts; load them in the app. |
| `borderRadius` | `small` 6, `base` 10, `medium` 14, `large` 18, `xLarge` 22 |

The opacity steps of each brand tone are generated from the brand colour, so tints, rings and borders match the fill. The neutral palettes (`light`, `dark`, `base`) are the default theme's.

With `@pyreon/vite-plugin`'s rocketstyle collapse, point the collapse at the brand theme so build-time resolution uses the same theme as the app: `collapse: { theme: { name: 'brandTheme', source: '@pyreon/ui-theme' } }`.

## Package defaults

`brandPackageDefaults` carries the brand look for the packages that draw outside the component library, as values those packages already accept (`src/tests/package-defaults.test.ts` feeds each to the real package):

```tsx
import { brandPackageDefaults as brand } from '@pyreon/ui-theme'

<ChartThemeProvider light={brand.charts.light} dark={brand.charts.dark}>…</ChartThemeProvider>  // palette + axis per mode
<Toaster {...brand.toast} />                                                                    // max 3 on screen
<Flow style={brand.flow.style[mode]}>… <Background {...brand.flow.background} /></Flow>          // ember selection, dots every 14px
render(doc, 'html', { styles: brand.document.styles })                                         // paper page, serif headings (HTML only)
```

`flow.style` is an inline style string because Flow's dark-mode rule sets its `--pyreon-flow-*` variables on the `.pyreon-flow` element itself, so a value set on an ancestor does not reach it in dark mode.

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
        base: 'rgba(124, 58, 237, 1)',      // violet-600
        contrast: '#ffffff',                // 5.70:1 (on violet-500 it would be 4.23:1 and fail)
        hover: '#6d28d9',                   // violet-700, 7.10:1 with white
        text: '#5b21b6',
        textDark: '#c4b5fd',
      },
    },
  },
}

<PyreonUI theme={myTheme}>…</PyreonUI>
```

`myTheme` satisfies `Theme` and every rocketstyle component type-checks against it. Changing a fill means re-checking its `contrast` and `hover`, and the opacity steps (`50`…`900`) still describe the old colour unless you replace them too.

## Mode (light / dark)

`@pyreon/ui-theme` itself ships ONE theme — it does NOT split into separate light / dark trees. Mode resolution happens at the `@pyreon/ui-core` `PyreonUI` provider:

```tsx
<PyreonUI theme={theme} mode="light">…</PyreonUI>
<PyreonUI theme={theme} mode="dark">…</PyreonUI>
<PyreonUI theme={theme} mode="system">…</PyreonUI>    // matches OS prefers-color-scheme
<PyreonUI theme={theme} mode="light" inversed>…</PyreonUI>  // flips
```

`useMode()` returns the resolved mode. Fills (`base`, `hover`) and the text on them (`contrast`) are the same in both modes. Text in a tone is not: components read `text` in light mode and `textDark` in dark mode through rocketstyle's `mode(light, dark)` helper. The neutral palettes (`light`, `dark`, `base`) are light-only today; most components still draw light surfaces in dark mode (#4340), and `<PyreonUI>` does not paint the page, so set the app background to match the mode.

## Gotchas

- **No `createTheme`. No `defaultTheme`.** Earlier docs referenced these; they don't exist. Build a theme by spreading `theme` (see Custom themes) or start from `brandTheme`.
- **Don't re-augment `ThemeDefault` / `StylesDefault` in your app.** This package owns the augmentation. Re-declaring them in a consumer `pyreon.d.ts` triggers `TS2320`.
- **CSS property naming follows `@pyreon/unistyle`** — `borderWidthTop` not `borderTopWidth`. Property-first.
- **`Theme` is the shape, not the values.** `theme` is declared `as const`, and `Theme` widens its leaves to `string` / `number`, so a custom theme must keep every key but may change any value. A custom tone must keep `contrast`, `hover`, `text` and `textDark` passing 4.5:1 against its fills, tints and both pages; run the pairs through `src/tests/contrast.test.ts`.

## License

MIT (private to the Pyreon monorepo).
