---
'@pyreon/native-compiler': minor
'@pyreon/charts': patch
---

`<FunnelChart>`, `<PieChart>` and `<GaugeChart>` lower to native. The accessor-prop hosts map their rows through the accessor bodies INLINED into one closure (`rows.enumerated().map { (i, d) in FunnelStage(value: Double(d.total), label: d.name, color: …) }` / `mapIndexed`), with the shared palette for an absent `color`; a block-bodied accessor warns by name. `onSelect` (already an index on these hosts) and `onSelectIndex` lower to the tap over `hitFunnel` / `hitArc`. `<GaugeChart>` lowers with its fixed half-circle box and the value text; `<PieChart showLegend>` renders without the legend and says so. README: the native-geometry section lists them.
