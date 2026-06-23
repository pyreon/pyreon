---
'@pyreon/machine': minor
---

API polish pass (breaking, pre-1.0 — clean over backward-compatible):

- **`send(event, payload?)` now returns the settled `TState`** (after any `always` cascade) instead of `void` — so `const next = machine.send('GO')` works, matching what users expect. Returns the unchanged current state for an unhandled event or a rejected guard. (Type-level breaking; existing callers that ignore the return are unaffected at runtime.)
- **`can(event, payload?)` now predicts `send` EXACTLY** — it always evaluates the guard with the given payload (or `undefined` if none). Previously a guarded event with no payload reported `true`; now it evaluates the guard, so `can('LOGIN')` with no/invalid payload against a payload-reading guard reports `false`. (Behavioral breaking — the precise, correct semantic.)
- **Guards are now throw-safe** — a guard that throws (e.g. reading a property of a missing payload) DENIES the transition rather than crashing `send` / `can` / the `always` cascade. Consistent with `@pyreon/permissions` predicate evaluation. This is what makes the precise `can(event)` (no-payload) safe.

Tests: +7 (send return value across transition / always-cascade / unhandled / guard-reject / throw-safe; can throw-safety + payload). The 3 tests that codified the old `can`-without-evaluating-guard behavior were updated to the new precise contract. Bisect-verified `safeGuard` (3 throw-safe tests fail when neutered) and the `send` return (5 fail when reverted to void). Coverage holds above the package's 98% floor.
