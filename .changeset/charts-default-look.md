---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

Charts look right out of the box:

- **Legend and colour by label** (web and native). Marks sharing a label share one legend entry, which toggles all of them, and one palette colour, as ECharts treats a series name. An area under a line, both labelled Revenue, no longer shows two Revenue swatches in two colours.
- **Area marks** fill translucent (0.3) by default instead of opaque; the new `areaOpacity` mark option sets it.
- **Charts follow the page's declared scheme.** They read the CSS `color-scheme` on `<html>` when it names one, else the OS preference, so a site with its own theme toggle gets matching charts.
- **`<OptionChart>` honours an explicit `<ChartThemeProvider>`**, for both cartesian and family options (it ignored one before). A bare option chart keeps ECharts' own light look, as ECharts does.
- **Dark gauges.** Under a non-default theme a gauge takes the theme's text and label colours instead of ECharts' light-theme greys.
- **SVG themes.** `optionToSvg`'s `theme` now reaches family charts too.
- **Candlesticks.** A candlestick's x labels thin and slant to what fits instead of overlapping, and its `dataZoom` opening window is applied.
