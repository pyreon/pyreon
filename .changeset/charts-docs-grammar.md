---
'@pyreon/charts': minor
'@pyreon/compiler': patch
---

`smooth` and `step` are now exported from the `@pyreon/charts` root, so a `<Line curve={smooth}>` needs no `/engine` import. The docs, README and manifest examples now use the `<Chart>` grammar. The typed-channel claim is corrected: `<Chart<Row>>` checks its own channels, but a mark checks its field names only when given the row type (`<Bar<Row> y="revenue">`). The charts import migration routes `smooth`/`step` to the root.
