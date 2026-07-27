---
'@pyreon/runtime-dom': patch
---

Drop the fresh-render duplicate-key `Set` in `<For>`'s keyed reconciler.

`handleFreshRender` allocated a second `Set` purely for duplicate detection and
paid `has` + `add` per row — an n-entry allocation plus two hash ops per row on
the bulk-create path. The keyed `cache` already IS that membership set on this
path (it is provably empty on entry, and every `renderInto` branch writes each
key into it), so the check now reads `cache.has(key)`: one hash op per row, no
second allocation.

Semantics are unchanged — duplicate keys are still skipped, so the
DOM-corruption safety the check exists for is intact, and the dev warnings are
byte-identical. Measured in isolation at 0.144ms per 10,000 rows.
