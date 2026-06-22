---
"@pyreon/validate": minor
---

Object algebra on `s.object(...)`: `.pick(keys)` / `.omit(keys)` / `.partial()` /
`.extend(shape)` / `.merge(other)` / `.keyof()`, plus the unknown-key policy
`.strip()` (default) / `.strict()` (error on unknown) / `.passthrough()` (keep unknown,
prototype-pollution-safe). All strictly typed (`Pick` / `Omit` / intersection / key-union).

Also upgrades object type inference: `.optional()` / `.nullish()` fields (and every
`.partial()` field) now infer as TRUE optional keys (`{ k?: T }`) instead of
required-with-undefined (`{ k: T | undefined }`) — matching Zod exactly under
`exactOptionalPropertyTypes`.
