---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
---

Better chart defaults and a few long-requested grammar props.

- **Palette.** The default palette is re-picked so every colour clears 3:1 against the background (WCAG 1.4.11, in both light and dark), and the first four series stay distinguishable under deuteranopia and protanopia. Light and dark keep the same hue per series. Charts that relied on the old default colours will change colour.
- **`<Legend direct />`** labels each line at its last point, in the series colour, instead of drawing a legend box. Labels that would collide are nudged apart, and the plot reserves room on the right for them.
- **`<Zoom window={{ start, end }} lock />`** opens a zoomed chart on a window and optionally pins its span.
- **`<Cell visualMap />`** draws a continuous legend over the data's own extent in the theme's ramp; a `visualMap({ domain, … })` spec still works.
- **`<Candle>` beside `<Zoom>`** opens its navigator on the given window.
- **Typed marks.** `const RowBar = Bar<Row>` narrows `y` to `Row`'s keys with zero runtime cost, and the native compiler lowers the alias like the mark it names.

All of these lower to iOS and Android.
