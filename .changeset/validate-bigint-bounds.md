---
'@pyreon/validate': minor
---

feat(validate): bigint comparison bounds — `.gt` / `.gte` / `.lt` / `.lte` / `.step` / `.between`.

Numeric parity for `s.bigint()`, matching `s.number()`'s comparison surface:

- **`.gt(n)` / `.lt(n)`** — strictly greater / less than `n` (EXCLUSIVE bounds; the existing `.min` / `.max` are inclusive-only, so an open interval `gt(0n).lt(100n)` wasn't expressible).
- **`.gte(n)` / `.lte(n)`** — inclusive aliases for `.min` / `.max`.
- **`.step(n)`** — alias for `.multipleOf(n)`.
- **`.between(lo, hi)`** — inclusive range.

bigints are genuinely used for crypto/financial validation, so symmetric bounds matter. bigint checks use the interpreter closure path (not JIT-inlined, like the existing bigint min/max), so no JIT changes. 11 tests (incl. values beyond `Number.MAX_SAFE_INTEGER`); the exclusive `gt` bound is bisect-verified.
