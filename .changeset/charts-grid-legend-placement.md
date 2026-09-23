---
'@pyreon/charts': minor
---

`<OptionChart>` honours a single `grid`'s position and the legend's placement, as ECharts does.

- `grid.left`, `top`, `right`, `bottom`, `width` and `height` (pixels or percent) fix the plot rect, and the axis labels draw in the margin. With a grid that sets `top`, the title and legend overlay the chart instead of pushing it down. The engine gains optional plot insets on `ChartSpec` (`gridLeft`, `gridTop`, `gridRight`, `gridBottom`).
- The legend now sits top-centre by default (ECharts' default; it was top-left). It reads `orient`, `left`/`right`/`top`/`bottom` (keywords, pixels, percents), `itemGap`, `textStyle` colour and size, and `formatter`. Where no grid places the plot, a bottom or right-hand legend takes its band off the chart, like the top legend always did.
- A multi-grid option no longer applies a grid's position twice inside its part.
