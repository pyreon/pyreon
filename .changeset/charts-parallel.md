---
'@pyreon/charts': minor
---

Parallel-coordinates family: `layoutParallel` (evenly spaced vertical axes; value axes linear with data or fixed `domain` and `inverse`, category axes by position; nulls and unplaceable values become gaps; per-row or constant line colour), `lineRuns`, `renderParallel` (rows as translucent polylines, `highlight` rows drawn last and opaque, axes/ticks/names, left-to-right entrance), `hitParallel` (nearest segment within a tolerance), `<ParallelChart>` (reactive canvas host, `onSelect(line)`, accessible per-axis table), `parallelToSvg` (server-safe).
