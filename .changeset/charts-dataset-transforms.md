---
'@pyreon/charts': minor
---

`dataset.transform` in the option facade's dataset pre-pass: `filter` (comparison conditions — `gt`/`gte`/`lt`/`lte`/`eq`/`ne` and their symbol spellings — composed with `and` / `or` / `not`), `sort` (one key or several, `asc`/`desc`, numeric or string), chained transforms per dataset, and `fromDatasetIndex` so derived datasets build on each other; series pick a derived dataset with `datasetIndex`. Unknown transform types and dimensions warn by name and pass the table through unchanged. Conformance corpus 29 → 30, floor 27 → 28.
