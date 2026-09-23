---
'@pyreon/charts': minor
'@pyreon/cli': patch
'@pyreon/mcp': patch
---

The chart capability ledger can no longer claim more than it proves.

`CHART_CAPABILITIES` rows now carry a status per target (`web`, `ios`,
`android`), a `gaps` list saying why a target falls short, and evidence that
must be a test. `chartCapabilityScore(mode, target?)` scores one target or all
three, and reports `partial` and `pending` counts. Every "unsupported"
warning in the option facade is tagged with the row it belongs to, and a
tagged row cannot be complete; the native compiler holds the same rule for
the props its hosts drop. Seven rows were added (key totality, multi-series,
axis pointer, media, keyboard, accessible table, split hosted rows).

The honest score is lower than the old one. The direct option contract is
complete for 32 of 68 rows on the web and for 1 of 68 natively, where an
`<OptionChart>` option still has to be a compile-time literal. The previous
ledger reported 100.

`echarts` is now an optional peer: `@pyreon/charts/plot` never imports it.
`pyreon doctor`'s doc-claims gate checks the chart host counts.
