---
"@pyreon/validate": minor
---

Shared client/server validation — one schema, one syntax, lightweight on the client and
superior on the server.

A new format registry lets a format check resolve a lightweight in-bundle validator by
default (client) and a heavy superior validator when `@pyreon/validate/server` is imported
(server). The SAME shared schema (`s.string().email()` / `.phone()`) validates leniently
+ fast on the client and strictly on the server — with the heavy server code tree-shaken
out of the client bundle entirely (proven: the disposable-domain list / strict validators
are absent from the main-entry bundle; present only in `@pyreon/validate/server`).

- **New formats** everyone needs: `s.string().phone()` (lightweight E.164 shape; the
  server upgrades it to full E.164 / `libphonenumber`-grade), `.ip()` (v4/v6), `.creditCard()`
  (Luhn + length). Exported standalone validators: `validatePhone` / `validateIp` /
  `validateCreditCard`.
- **`@pyreon/validate/server`** (new subpath, side-effect install): strict email (rfc5322
  length + disposable-domain blocklist, extensible via `addDisposableDomains`) + strict
  phone (full E.164, requires `+`). `installServerValidators()` / `isDisposableEmail` /
  `strictEmail` / `strictPhone` exported. Async DNS-MX / BIN checks compose via
  `.refine(asyncFn)` + `parseAsync`.
- **`installFormatValidator(name, fn)`** — public API to plug your own superior validator
  for any format (e.g. wire `libphonenumber-js` server-side).

The mechanism: presence of an installed heavy validator IS the client/server switch — the
client never imports `/server`, so its registry stays empty (light) and the heavy code
never reaches the browser; the server imports `/server` and the same schemas validate
strictly. Resolved at parse time, so it works even with the compile-once validator cache.
