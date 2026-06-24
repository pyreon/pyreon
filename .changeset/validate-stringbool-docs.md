---
'@pyreon/validate': minor
---

feat(validate): `s.stringbool()` + manifest `api[]` enrichment for the new methods.

- **`s.stringbool(opts?)`** — coerce a boolean-ish STRING to a real boolean (Zod 4's `z.stringbool`). Type-checks a string, then maps configured truthy/falsy tokens (case-insensitive, trimmed; defaults `true`/`1`/`yes`/`on`/`y`/`enabled` ↔ `false`/`0`/`no`/`off`/`n`/`disabled`) to `true`/`false`; anything else errors. Stricter + more explicit than `s.coerce.boolean()` (which applies JS truthiness to any input). Custom `truthy` / `falsy` / `message` via options.
- **Docs:** added `api[]` manifest entries (→ MCP `get_api` + the generated reference page) for the notable methods shipped across this batch that were changeset-only: `array` / `or` / `and` / `pipe` / `superRefine` / `preprocess` / `nonoptional` / `stringbool`.

19 stringbool tests; manifest snapshot updated to 21 entries.
