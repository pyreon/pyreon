---
'@pyreon/charts': minor
---

OptionChart and optionToSvg now place a title the way ECharts 6 does. It is centred and sits 15 px from the top inside a 5 px padding, set in 18 px bold over a 12 px subtext 10 px below. The title reads `top`, `bottom`, `textVerticalAlign`, `padding`, `backgroundColor` and borders. A number or percent `left` / `right` places the block's edge, and both lines stay left-aligned as ECharts' do. Several titles all draw, and `link` / `sublink` open on click with a pointer cursor. Placement is checked against ECharts' own SSR output. Colours still come from the chart's theme.
