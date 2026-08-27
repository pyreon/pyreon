---
"@pyreon/document": patch
---

perf: O(n) table column indexing in the teams/discord renderers (was O(n²))

Both renderers resolved a cell's column with `columns.indexOf(col)` inside a
per-column × per-row loop — O(cols) per cell, O(rows × cols²) per table. The
loop index is already available (`.map`'s second arg / the `for` counter), so
use it directly: O(1) per cell. Using the actual loop position is also more
correct than `indexOf` if two column defs compare equal.

Behaviour-identical; locked by the existing multi-column table tests plus a new
column-alignment spec (bisect-verified: a wrong index drops later columns).
