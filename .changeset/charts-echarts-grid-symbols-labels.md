---
'@pyreon/charts': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

OptionChart and optionToSvg now lay a cartesian option out on ECharts 6's default grid. The plot sits 15% from the left, 65 px from the top, 10% from the right and 80 px from the bottom. It grows only where an axis label would otherwise leave the chart (`outerBoundsMode: 'auto'`). The title, legend and dataZoom slider draw in the grid's margins, as in ECharts, instead of pushing the plot around.

This is a visible change: option charts gain ECharts' margins. Pass a `grid` to place the plot yourself.

- **Line symbols:** a line series shows ECharts' default `emptyCircle` at its data. `showSymbol: false` or `symbol: 'none'` hides them. `showAllSymbol` is read. A crowded category axis keeps only the symbols at its label interval, as ECharts does. Empty symbols (`emptyCircle`, `emptyRect`, …) draw as a ring round the chart surface.
- **Axis labels:** category x-axis labels thin by ECharts' own `calculateCategoryInterval` instead of rotating. `axisLabel.rotate` and `axisLabel.interval` are read.
- **Text:** option text is 12 px, ECharts' size, unless the theme sets one.

All of this is checked against ECharts' own SSR output: plot rects, symbol positions and tick labels.
