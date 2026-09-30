---
'@pyreon/charts': minor
---

The engine gains ECharts' own dataZoom slider (`slider-zoom.ts`). It sits under the plot, laid out in the whole chart. It draws the data shadow (padded 30% of the span), the window filler, 15px handles 1px inside the window ends, and the brush move handle above it. Pressing the move handle drags the window. `<CandlestickChart zoom>` draws it; `PlotChart`'s own navigator is unchanged.
