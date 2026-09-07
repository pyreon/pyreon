---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

**`@pyreon/charts/plot` gets one theme.** `ChartTheme` is now a token map — `palette`, `background`, `surface`, `text`, `label`, `axis`, `grid`, `fontFamily`, `fontSize`, `titleSize`, `radius`, `enterMs`, `updateMs` — and every host, family, legend, title and tooltip reads from it. Series colours come from `theme.palette` (the nine private copies of one hex list are gone), so "change the series colours" is finally a theme. `chartThemes.light` / `chartThemes.dark` ship built in, `palettes` exports the named sets (`pyreon`, `pyreonDark`, `echarts6`, `echarts5`, `echartsDark`, `observable10`, `tableau10`, `okabeIto`, `tailwind`), and the new default palette is Pyreon's own. `<ChartThemeProvider mode theme>` provides a theme to every chart below it (`mode={useMode}` hands PyreonUI's mode through); with no provider a chart follows `prefers-color-scheme`. `registerTheme` accepts the same tokens (ECharts-shaped aliases still work). Breaking: `ChartTheme` gained required fields — a hand-built full `ChartTheme` needs them (a `Partial` on the `theme` prop is unchanged); the built-in `dark` registry theme is now Pyreon's dark theme, not ECharts'.

Also on `/plot`: `<BoxplotChart>` + `fiveNumber` and the `sma` / `ema` / `bollinger` / `trend` indicator marks were built and tested but never exported — they are now.

Native: the theme struct crosses with every field, `theme={{ palette: [...] }}` colours a plot's marks on iOS/Android, and `palette.ts` joins the generated engine.

PMTC lowers `readonly T[]` / `ReadonlyArray<T>` exactly like `T[]` (the theme palettes are `readonly string[]` end to end, so an `as const` palette typechecks as a theme override); `keyof` / `unique` types warn by name.
