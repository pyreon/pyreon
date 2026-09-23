---
'@pyreon/charts': minor
---

A candlestick option's `dataZoom` is now interactive on the web. A `slider` draws ECharts' strip under the chart; drag the band or a handle to move the window. `inside` zooms on the wheel and pans on a drag inside the plot, and `zoomLock` and `minSpan` / `maxSpan` hold. `<CandlestickChart>` gains the matching `zoom` prop, and a click still reports the GLOBAL candle index. `optionToSvg` draws the opening window.
