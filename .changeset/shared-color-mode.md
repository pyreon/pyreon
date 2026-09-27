---
'@pyreon/core': minor
'@pyreon/ui-core': minor
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
'@pyreon/compiler': patch
---

One light/dark mode for the whole framework. `useColorMode()` in `@pyreon/core` returns the mode in scope: the nearest `<ColorModeProvider mode>` or `provideColorMode(mode)`, else the page's declared `color-scheme`, else `prefers-color-scheme` (light on the server). `mode` is `'light'`, `'dark'` or `'system'`, or an accessor. `systemColorMode()` is the page-and-OS half alone.

`<PyreonUI mode>` now provides it, so everything below a PyreonUI follows the UI system's mode with no extra wiring.

**Breaking, `@pyreon/charts`:** charts read the shared mode, so a chart below a dark `<PyreonUI>` is dark. `<ChartThemeProvider>` no longer takes `mode`: set it with `<PyreonUI mode>` or `<ColorModeProvider mode>`. `systemChartMode()` is now `systemColorMode()` in `@pyreon/core`. The provider hands down a theme per mode, so a mode set below a provider still picks that provider's `light` / `dark` override. `pyreon doctor diagnose` explains both upgrade errors.

**Native:** a literal `<ColorModeProvider mode>` or `<PyreonUI mode>` is a compile-time scope the charts below inherit, and it re-resolves an outer provider's per-mode overrides. `'system'` keeps the platform scheme. A reactive mode on `<ColorModeProvider>` warns by name; on `<PyreonUI>` it is silent, as it was before. In both cases the charts below follow the platform scheme instead of being pinned to light.
