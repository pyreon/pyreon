---
'@pyreon/validate': minor
---

String format long-tail (Zod-4 parity): `s.string()` gains `.cuid()` (v1 cuid, distinct from the existing `.cuid2()`), `.base64url()` (URL-safe alphabet), `.cidr()` (IPv4/IPv6 CIDR notation — splits on `/` and reuses the vetted IP regexes + an in-range prefix check, avoiding a ReDoS-prone IPv6 regex), `.duration()` (ISO 8601 duration, e.g. `P3Y6M4DT12H30M5S` / `PT1H`), and `.e164()` (E.164 phone). All route through the same client/server `resolveFormat` registry as the other formats and carry per-check `opts`.
