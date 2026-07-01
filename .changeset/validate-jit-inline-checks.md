---
'@pyreon/validate': patch
---

perf(validate): JIT-inline `between` / `multipleOf` / `startsWith` / `endsWith` / `includes`

The JIT already inlined the cheap numeric/length conditions (`min`/`max`/`int`/…)
but fell back to a per-parse CLOSURE call for five more common checks. They are
all trivially inlinable with a byte-exact condition, so the generated validator
now emits the comparison directly instead of `H[k](v, ctx)`:

- `check:number:between`   → `v < lo || v > hi`
- `check:number:multiple-of` → `v % n !== 0`
- `check:string:starts-with` → `!v.startsWith("…")`
- `check:string:ends-with`   → `!v.endsWith("…")`
- `check:string:includes`    → `!v.includes("…")`

Each matches its check closure's fail condition exactly (verified by the
`jit-differential` seeded-fuzz suite — 1000 random object schemas + 300 array
roots agree JIT-vs-interpreter; 619 tests green). Removes one closure call per
such check on the valid parse path — measured ~10% faster on a range/positional
schema with no format checks (e.g. `{ age: between(0,150) }`: ~21ns → ~19ns).

Note: the flagship valid-parse benchmark rows all carry `string().email()`,
whose regex closure dominates, so this doesn't move those headline numbers — it
speeds up the (very common) class of schemas doing numeric-range / prefix /
suffix / multiple-of validation without a format check.
