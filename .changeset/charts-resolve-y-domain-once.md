---
'@pyreon/charts': patch
---

A chart frame resolves its value-axis range once instead of at every place that needs it (layout, each series' geometry, markers). Unpinned, that range is a full scan of every series, so a 100,000-point line mounts about 9% faster. Log axes are unaffected.
