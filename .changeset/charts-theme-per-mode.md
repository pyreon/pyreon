---
'@pyreon/charts': minor
---

`<ChartThemeProvider>` takes `light` and `dark` overrides that apply only in their mode, over the shared `theme`:

```tsx
<ChartThemeProvider mode={useMode} theme={{ palette: palettes.okabeIto }} dark={{ background: '#0b1020' }}>
```

A provider without `mode` inherits the mode above it, so its `light` or `dark` still picks correctly. Both are plain data, so they lower on iOS and Android through the provider's compile-time scope, where a mode-branching `theme` accessor cannot.
