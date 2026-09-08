---
'@pyreon/flow': patch
---

`layout()` always anchors the result at the origin. The per-algorithm
normalisation ran BEFORE overlap relaxation, which can push boxes past the
origin on crowded graphs — `force`, `stress`, `radial` and `tree` returned
negative positions on random graphs (found by the new seeded property sweep:
layouts, path builders, edge geometry, JSON and undo/redo round-trips).
