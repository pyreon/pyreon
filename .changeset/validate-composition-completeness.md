---
'@pyreon/validate': minor
---

Composition completeness (Zod-4 parity gaps): `s.record(keySchema, valueSchema)` now validates keys against an optional key schema (the single-arg `s.record(valueSchema)` form is unchanged); `s.tuple([...]).rest(schema)` accepts a variadic tail validated against `schema` (length is then "at least the fixed count" instead of exact); `s.set(...)` and `s.map(...)` gain `.min(n)` / `.max(n)` / `.size(n)` size checks (plus `.nonEmpty()` on sets). All checks compose through the existing interpreter path and carry per-check `opts` (code / key / params / fallback / message) like every other built-in check.
