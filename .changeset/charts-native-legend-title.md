---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

The legend and title blocks draw natively. `renderLegend` is rewritten in the crossing subset (`legendPlan` is a named top-level plan; `LegendPager.prev` / `next` are plain rects guarded by `hasPrev` / `hasNext` instead of `Rect | null`; the page label goes through `plain`), and it crosses into the generated engine together with `renderTitle`. The native runtimes gain `pyreonShiftCmds(cmds, dy)` — the web hosts' `shiftCmd`, which sits the plot below the chrome. `<PlotChart showLegend showTitle subtitle legendMaxRows>`, `<PieChart showLegend>` and `<RadarChart showLegend>` now emit the title block, the legend, and the plot translated down by both, with the tap offset to match; a host without the flags emits exactly what it did before.
