---
'@pyreon/charts': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

The engine can lay a cartesian chart out on ECharts 6's default grid: the plot sits 15% from the left, 65 px from the top, 10% from the right and 80 px from the bottom, and grows only where an axis label would otherwise leave the chart (`outerBoundsMode: 'auto'`). The title, legend and zoom slider draw in the grid's margins instead of pushing the plot around.

- **Line symbols:** a line series can show ECharts' `emptyCircle` at its data, and `showAllSymbol` is honoured. A crowded category axis keeps only the symbols at its label interval, as ECharts does. Empty symbols (`emptyCircle`, `emptyRect`, …) draw as a ring round the chart surface.
- **Axis labels:** category x-axis labels thin by ECharts' own `calculateCategoryInterval` instead of rotating, and take an explicit rotation or interval.
