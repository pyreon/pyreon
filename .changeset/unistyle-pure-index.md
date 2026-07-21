---
'@pyreon/unistyle': patch
---

perf: importing a unit helper no longer retains the whole property map

The `keyToIndices` fast-path index was built by a bare top-level `for` loop — an
unremovable side-effect statement that retained the 170-entry `propertyMap` (and the
index) in every consumer bundle, styling used or not: importing just `value` paid
~5KB gz. The build is now a `/* @__PURE__ */`-annotated function call — a pure index
over static data, droppable exactly when `styles()` is unused; build timing for real
consumers is unchanged (module eval). Measured: `value`-only 5.0 → 1.98KB gz (−60%),
full entry unchanged.
