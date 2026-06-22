---
"@pyreon/validate": minor
---

`s.string().email()` — fix overly-loose default + add server/client precision tiers.

The default email regex was `^[^\s@]+@[^\s@]+\.[^\s@]+$`, which accepted `a@b.c`
(single-char TLD) and most malformed input — looser than Zod 4 / Valibot / ArkType
(all of which reject `a@b.c`). The default is now the modern consensus ('standard')
regex: requires a 2+ char alpha TLD and rejects leading / consecutive dots.

New `precision` option on `.email({ precision })`:
- `'html5'` — exactly what `<input type=email>` accepts (lenient; allows `a@b.c`).
- `'standard'` — DEFAULT, Zod-4-grade.
- `'rfc5322'` — `'standard'` + RFC 5321 length limits (local ≤64, domain ≤255,
  total ≤254), for server-authoritative validation. The client uses the lean
  default for fast UX; the server can opt into the stricter tier (bundle size
  doesn't matter server-side) and add `.refine()` for DNS / disposable-domain checks.

`validateEmail(value, precision?)` is exported for reuse. **Behavior change:** inputs
the old loose regex wrongly accepted (e.g. `a@b.c`) now fail the default `.email()` —
pass `{ precision: 'html5' }` to keep the lenient behavior.
