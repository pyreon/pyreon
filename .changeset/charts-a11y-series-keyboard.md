---
'@pyreon/charts': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Accessibility on `<Chart>` / `<PlotChart>`:

- **Up/Down now step through the series.** Left/Right still walk the data. With a series picked, the live region reads just that series — `Revenue: 3,200 at Mar, 3 of 12` — so a keyboard user can follow one line across the chart instead of hearing every series at every point. Stepping past the last series returns to the whole row; Escape clears both. Up/Down used to duplicate Left/Right.
- **The spoken summary says how much a series moved,** not only which way: `rising 45% from 100 to 145`, `rising 3.2× from 100 to 320`. No percentage is stated from a zero or negative start. The native `describeChart` says the same.
- **Fix:** the web canvas's description, table and announcements named series "Series 1", "Series 2" even when each mark had a `label`, so a screen reader heard names no sighted reader saw. They now use the mark's label, as the legend, the tooltip and the native hosts already did.
