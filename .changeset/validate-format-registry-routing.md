---
'@pyreon/validate': patch
---

fix(validate): route `url` / `uuid` / `iso.date` / `iso.dateTime` / `iso.time` through the client/server format registry.

These five string formats validated against a hardcoded regex, so — unlike `email` / `phone` / `ip` / `creditCard` (and the new cuid2/ulid/nanoid/emoji/base64/jwt) — a server could NOT upgrade them via `installFormatValidator`. They now route through `resolveFormat(name, lightDefault)` like every other format, so **all** string formats are client/server-upgradeable.

The client default behavior is unchanged (same regexes); the method signatures are unchanged. Registry names: `url`, `uuid`, `iso-date`, `iso-datetime`, `iso-time`.

9 tests; the routing is bisect-verified (reverting `uuid` to the hardcoded regex fails the upgrade specs).
