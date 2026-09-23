---
'@pyreon/flow': patch
---

`multiSelect: false` now disables additive selection everywhere, not just the drag-select box. On web, `selectNode(id, true)`, `selectNodes(ids, true)` and `selectEdge(id, true)` used to add to the existing selection even with `multiSelect: false`. They now replace it, which is what the option documents and what both native engines already did. A shared web-oracle parity scenario found the gap.
