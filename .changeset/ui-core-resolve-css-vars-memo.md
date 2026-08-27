---
"@pyreon/ui-core": patch
---

perf(ui-core): memoize `resolveCssVariables()` (per-flip rocketstyle hot path)

`resolveCssVariables()` allocated a fresh 3-key object on every call. Its
hottest caller is rocketstyle's `_resolveRsEntry`, which reads `.enabled` twice
per flip per component — so a single theme/mode flip on a rocketstyle-heavy page
allocated hundreds of short-lived objects here alone (plus one per `PyreonUI`
mount and per pre-paint resolution).

The result is a pure function of `config.cssVariables`, which changes only when
`init()` REASSIGNS it (the documented invariant is that the flag does not flip
mid-session, let alone mutate in place). It is now memoized on the raw value's
identity: the dominant default (`false`) returns a pre-seeded object with zero
allocation, and a real `init()` toggle reassigns to a value that misses the
cache and re-resolves. Every caller only reads the result, so the shared
reference is safe.

Bisect-verified: two successive calls under stable config return the SAME object
(the pre-memo code allocated a fresh one each call, failing `a === b`), while an
`init({ cssVariables })` toggle is still observed. Stays within the ui-core
bundle budget.
