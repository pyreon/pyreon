---
'@pyreon/validate': patch
---

JIT parse: an inline array whose element subtree is pure inline (no fallback
anywhere under it) no longer materialises `ctx.path` on every parse. Its loop
index stays PENDING like the static keys already did, and every failure site
under it — nested arrays included — reconstructs the full path from trailing
index arguments; only a `_runInto` fallback (or an array whose elements can
reach one) still flushes the real path. A pure object/array field is also
absorbed into the enclosing object LITERAL instead of `{}` + per-key
assignment. Verdicts, issue order and issue paths are byte-identical (816
specs + the JIT↔interpreter differential fuzz; 6 new path/emit locks incl.
strict keys, format checks and discriminated-union members under nested
arrays). Measured raw-emit A/B on a quiet box, two runs: the
`object.array-of-objects` cell 37–39 → 34–35 ns (a nominal 5–13%, CI-overlap),
`array.20-objects` unchanged. A small win, stated as one.
