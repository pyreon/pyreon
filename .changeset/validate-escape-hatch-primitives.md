---
'@pyreon/validate': minor
---

Escape-hatch primitives (Zod parity): `s.never()` (accepts no value — every input including `undefined` is an error; pair with `.optional()` to forbid a key only when present), `s.custom<T>(check?, message?)` (validate by a user predicate; with no predicate it accepts everything as `T`, emitting a `custom`-coded issue when the predicate fails), and `s.instanceof(Ctor, message?)` (assert `input instanceof Ctor` — for `File` / `Date` / `URL` / user classes; the default message names the class). All three are real `s` factories with manifest + MCP `get_api` entries.
