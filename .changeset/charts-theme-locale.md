---
'@pyreon/charts': minor
---

Theme registry and locale packs for the option facade: `registerTheme` / `getTheme` / `listThemes` / `resolveTheme` over an ECharts-shaped `ThemeDefinition` (palette, background, text colour + size, axis and grid colours; `light` and `dark` built in), applied via `compileOption(option, { theme })` — series without an explicit colour take the palette, the spec takes the text/axis/grid colours, and `optionToSvg` paints the background; an unknown name warns and falls back. `registerLocale` / `getLocale` / `numberFormatter` / `dateFormatter` over Intl with optional packs (number options, date options, month names), applied via `{ locale }` to value-axis labels and time-axis labels unless the option carries its own formatter.
