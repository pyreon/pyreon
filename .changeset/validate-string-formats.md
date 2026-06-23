---
'@pyreon/validate': minor
---

feat(validate): modern string format checks — `cuid2` / `ulid` / `nanoid` / `emoji` / `base64` / `jwt`.

Adds the modern ID + encoding formats every Zod/Valibot migrant expects, as `s.string()` methods:

- `.cuid2()` — lowercase alphanumeric, starts with a letter
- `.ulid()` — Crockford base32, 26 chars (case-insensitive)
- `.nanoid()` — URL-safe alphabet (`A-Za-z0-9_-`)
- `.emoji()` — one or more emoji code points (Unicode property escapes)
- `.base64()` — standard alphabet with optional `=` padding
- `.jwt()` — three base64url segments (`header.payload.signature`)

Each routes through the **client/server registry seam** (`resolveFormat`), so a server can swap in a stricter validator for any of them in place via `installFormatValidator(name, fn)` — the same mechanism `@pyreon/validate/server` uses to upgrade `email` / `phone`, without touching the shared schema. (`datetime` is intentionally omitted — already covered by `.iso.dateTime()`.)

15 new tests; the registry-routing + check logic both bisect-verified. No new public exports (these are `s.string()` methods, like the existing `.email()` / `.uuid()`), so no manifest `api[]` / snapshot change.
