---
'@pyreon/charts': minor
---

`<ChartThemeProvider>` takes `light` and `dark` overrides that apply only in their mode, over the shared `theme`:

```tsx
<ChartThemeProvider theme={{ palette: palettes.okabeIto }} dark={{ background: '#0b1020' }}>
```

The mode is the colour mode in scope — `<PyreonUI mode>`, `<ColorModeProvider>`, else the page's scheme — so `light` or `dark` picks correctly with no wiring. Both are plain data, so they lower on iOS and Android through the provider's compile-time scope, where a mode-branching `theme` accessor cannot.
