---
"@pyreon/validate": minor
---

Add coercion: `s.coerce.string()` / `.number()` / `.boolean()` / `.date()` / `.bigint()`.
Each coerces the input via the JS constructor before validation, then runs the
primitive's normal checks on the coerced value (`s.coerce.number().int().min(0)`
accepts `"42"` → `42`). Mirrors Zod's `z.coerce.*`.
