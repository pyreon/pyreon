---
'@pyreon/loom': patch
---

Chrome + views polish: the brand block, sidebar group heads, health/cycles pills, detail-rail metric rows, and impact ranking rows all rendered their children COLUMN-stacked — three stacking sources fixed (the needsFix flex-fix span on buttons is now `display: contents`; `Row`'s layout moved from the attrs `css` string into the theme so a per-instance `css` prop no longer discards it; components whose `css` attr omitted `flex-direction: row` now declare it, since the Element wrapper's explicit column otherwise survives). The impact view's reach bars now actually render as a ranked bar chart, metric rows are label-left/value-right, and the matrix's rotated column labels are clipped + truncated instead of overflowing through the view header.
