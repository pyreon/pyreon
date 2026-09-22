---
'@pyreon/charts': minor
---

OptionChart and optionToSvg now lay the legend out the way ECharts 6 does.

- **Icons:** each entry draws its series' icon. That is a 25 × 14 rounded rect, a line with its symbol for a line series, or the symbol for a scatter series. `legend.icon`, per-item `icon` and a series' `legendIcon` override it.
- **Items:** the name sits 5 px after the icon. Entries are 8 px apart and wrap at the available width (ECharts' `boxLayout`, icon bounds included). The legend reads `itemWidth`, `itemHeight`, `itemGap`, `padding`, `align`, `inactiveColor`, `backgroundColor` and borders.
- **Placement:** the block sits centred 15 px above the bottom, inside a 5 px padding.
- **Space:** a legend in the top half reserves room above the plot, and one in the bottom half below it.

Checked against ECharts' own SSR output.
