---
'@pyreon/validate': minor
---

feat(validate): number comparison methods — `.gt` / `.gte` / `.lt` / `.lte` / `.step` / `.safe`.

Zod-parity number bounds on `s.number()`:

- **`.gt(n)` / `.lt(n)`** — strictly greater / less than `n` (EXCLUSIVE bounds). New capability — the existing `.min` / `.max` are inclusive-only, so an open interval like `gt(0).lt(10)` wasn't previously expressible.
- **`.gte(n)` / `.lte(n)`** — inclusive aliases for `.min` / `.max` (the names Zod migrants reach for).
- **`.step(n)`** — alias for `.multipleOf(n)`.
- **`.safe()`** — within the IEEE-754 safe-integer RANGE (`Number.MIN_SAFE_INTEGER` … `MAX_SAFE_INTEGER`). Bounds-only, matching Zod's `.safe()` — NOT an integer-ness check (compose with `.int()` for that).

`gt` / `lt` / `safe` are inlined on the JIT fast path (cheap comparison conditions); `gte` / `lte` / `step` delegate to the existing checks. 19 tests; both the interpreter check and the JIT inline condition are bisect-verified for `gt`.
