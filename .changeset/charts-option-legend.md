---
'@pyreon/charts': minor
---

`<OptionChart>`'s legend is interactive, as in ECharts. A click on an entry hides every series of that name and a second click shows it again; a hidden series keeps its colour slot and draws, hits and tooltips nothing. `legend.selected` starts named series off, `legend.selectedMode` (`'single'`, `false`) changes what a click does, and `legend.data` picks and orders the entries. The new `onLegendSelectChange` prop reports every change, as ECharts' `legendselectchanged` does. Before, the option legend was a static picture.
