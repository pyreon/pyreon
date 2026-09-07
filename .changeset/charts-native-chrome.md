---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

**Native chrome parity for the family hosts.** `showTitle` / `subtitle`, `showLegend` and `tooltip` now lower on every generic and accessor host (treemap, sunburst, tree, river, sankey, graph, gantt, polar, calendar, funnel, pie) on both native targets — not only on the plot host. The legend's entries and the tooltip's lines come from ONE crossing module, `chrome.ts` (`treemapLegend`, `sankeyTip`, `pieTip`, … plus `renderTooltip`, which draws the box into the draw list), and the web canvas host now calls the same functions, so what a legend lists and what a tap says agree by construction. On native a tap shows the tooltip and a tap on nothing dismisses it; a host with a tap lays out ONCE (the paint and the hit used to compute the layout twice). `animate` is the one chrome prop still named as unlowered.

PMTC: an annotated local (`const e: LegendEntry = { … }`) steers its object literal to the named struct — the field set alone picked a same-shaped sibling (`Slice` for a `TooltipRow`) or, with an optional field omitted, no struct at all (a tuple); `readonly T[]` / `ReadonlyArray<T>` lower like `T[]`; `keyof` / `unique` warn by name.
