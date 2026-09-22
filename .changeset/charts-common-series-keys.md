---
'@pyreon/charts': minor
---

The ECharts series keys every series type shares, honoured on `<OptionChart>`.

- **Per-datum colour.** A datum's own `itemStyle.color`, and `colorBy: 'data'`
  (a palette colour per datum), now paint. They were dropped silently. The
  engine's `Series` gains an `itemColors` channel, generated into the native
  engines, and every datum fill (bars, stacked and grouped segments,
  waterfall steps, points) goes through it, so hover, select and blur act on
  the datum's own colour.
- **`silent`** series are never hit: no tooltip, cursor or selection.
- **`cursor`**: the pointer over an item shows the series' `cursor`, or
  `pointer` by default, as in ECharts.
- **A series' own `tooltip`** refines the global tooltip for that series' items.
- **`universalTransition`** on a series turns the morph on for the chart.
- `id` (used by the `setOption` merge), `seriesLayoutBy` and `datasetId` (used
  by the dataset pass) no longer draw a "no mapping" warning; they were
  already honoured.
- A tooltip formatter's `params.seriesIndex` is now the option's own series
  index, even when an unsupported series was skipped.

The shared canvas host gains a `cursor` hook. The measured contract drops from
1,011 to 947 unmapped series keys.
