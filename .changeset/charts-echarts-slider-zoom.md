---
'@pyreon/charts': minor
---

An option chart's slider `dataZoom` is now ECharts' own slider. It sits under the plot in the grid's bottom margin, laid out in the whole chart with `left` / `right` / `top` / `bottom` / `width` / `height` honoured. It draws the data shadow (padded 30% of the span), the window filler, 15px handles 1px inside the window ends, and the brush move handle above it. A 7-case differential against ECharts' SSR output holds its geometry to half a pixel. Pressing the move handle drags the window. PlotChart's own navigator is unchanged.
