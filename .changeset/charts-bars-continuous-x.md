---
'@pyreon/charts': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Bars on a numeric or time x axis for `@pyreon/charts`. With `xValue` (and `<Axis x time>`), plain, grouped, stacked and waterfall bars sit at their own x instead of in an equal band: the slot is the smallest positive gap between two x values, or the new `barSpan` prop (in x units), bars are centred on x and the axis is padded by half a slot. `barWidth`, `barGap` and `barCategoryGap` work inside the slot. Horizontal charts tick the numeric axis down the y side; `<Axis x inverse>`, RTL, the hit rects, the tooltip, the keyed update morph (bars only), the focus ring and the server-rendered first frame follow. `barSpan` lowers to iOS and Android as a literal. `chartToSvg` gains `xTime`.

Also gates every dev-only warning at its call site (`process.env.NODE_ENV !== 'production'`), so the message strings no longer ship in production bundles (about 250 B gzip off a `PlotChart`, about 215 B off a `Chart` pie).
