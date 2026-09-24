---
'@pyreon/charts': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Stacks now follow ECharts' `dataStack`, and negative values in a stack are no
longer dropped. A stacked bar with a negative value used to lose that segment
silently, and its value axis ignored the negatives. Stacks now diverge from
zero as ECharts' default `stackStrategy: 'samesign'` does: positives up,
negatives down. `stackStrategy: 'all' | 'positive' | 'negative'`,
`stackOrder: 'seriesDesc'` and separate `stack` groups are honoured for bars
and lines. Two differently named stacks used to share one
running total. The engine exposes this as `stackLevels`,
`layoutStackLevels(H)` and `stackLevelsExtent`; `layoutStackedBars(H)` and
`stackedExtent` keep their signatures with the new, ECharts-default
behaviour.

Bars honour `barMinHeight`: a shorter bar grows to it from its base, clipped
to the grid. `showBackground` draws a strip behind each bar in
`backgroundStyle.color` and `opacity`.

A `NaN` datum is an empty datum, like `null`: it leaves a gap instead of
being zeroed with a warning.
