---
'@pyreon/charts': minor
---

`<OptionChart>` honours ECharts' `selectedMap` on cartesian series. Items named in it (by their own `name`, else their category), or every item for `'all'`, start selected and paint in their `select` style. With `selectedMode: 'series'`, the series starts pinned. The pins are seeded once per option, so a later click still owns them.
