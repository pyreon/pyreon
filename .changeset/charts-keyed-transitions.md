---
'@pyreon/charts': minor
'@pyreon/native-compiler': patch
---

`<Chart by="id">` (and `<PlotChart by={(d) => d.id}>`) gives rows an identity for update animation, like `<For by>`. A data change then tweens each row from its own previous value, and a new row grows in from the baseline (bars, areas) or appears in place (lines, points). A row-count change with `by` now tweens instead of snapping. Without `by`, rows are matched by position, so a sliding window used to animate every bar toward its neighbour's value.

On iOS and Android, `by` warns by name: native update animation still matches rows by position.
