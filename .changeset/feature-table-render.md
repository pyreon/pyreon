---
'@pyreon/feature': minor
---

Add `feature.Table` — render the table `useTable()` already computes.

`useTable()` derives columns from the schema, wires sorting and the global filter to signals, and returns a live table. Nothing rendered it, so every app hand-wrote ~50 lines of thead/tbody — and met two traps that have nothing to do with their domain:

- A `<th>` carries a `key`, so the keyed reconciler REUSES the node on a state change and never re-runs its body. A sort indicator read bare therefore freezes at its first value; it must sit inside an accessor.
- `getVisibleCells()` comes from `columnVisibilityFeature`, which `featureTableFeatures` does not register — `getAllCells()` is correct here, and reaching for the other one silently renders nothing.

`<Feature.Table of={t} />` owns both. Per-COLUMN cell overrides keyed by column id (`cell={{ status: ({ value, row }) => … }}`), for the same reason `Field` is per-field: a generated table is excellent until one column needs a badge or a formatted date. `empty` renders a full-width row when the row model is empty; `sortable={false}` drops the handlers and the indicator.
