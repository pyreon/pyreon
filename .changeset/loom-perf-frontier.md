---
'@pyreon/loom': patch
---

Records the measured performance frontier of the import scan in the code, and adds `bun run bench:loom` so the numbers are reproducible instead of living in someone's scratch directory. No runtime change.

Three optimizations that look obviously right on paper were prototyped and measured, and all three lose: reading files concurrently is worth 1.09x in the real scan (not the 1.25x an isolated read benchmark projects, because the per-file CPU work already hides most of the syscall latency) and would cost making `buildReport` async; fusing the specifier match into the lexer so the stripped string is never materialized measures 0.81x — an outright loss, because `isTypeOnlyStatement` wants random access into that string and tracking statement heads incrementally costs more than the string building it avoids; and the various per-file skips are worth 1-2ms each.
