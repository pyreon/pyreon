---
'@pyreon/compiler': patch
'@pyreon/lint': patch
---

Three detector/rule precision fixes, each found by running the analyzers against
the framework itself and reading what they flagged.

- `static-return-null-conditional` had NO signal gate, unlike its documented
  sibling `static-early-return-conditional`. It fired on every top-level
  `if (cond) return null`, including `if (typeof document === 'undefined')` —
  an SSR guard that can never re-evaluate — and told the author to wrap it in a
  reactive accessor. Now gated on a tracked binding in the condition, matching
  the sibling and the message's own claim.
- `pyreon/no-unbatched-updates` counted any `.set()` as a signal write. A signal
  write is single-argument; `map.set(k, v)`, `headers.set(k, v)` and
  `params.set(k, v)` are not. Server middleware calling `ctx.headers.set(...)`
  five times was reported as unbatched signal updates in code containing no
  signals. Arity now rules those out, which also generalises past the existing
  receiver-name tracking (that only caught locals bound to `new Map()`).
- `native-audit`'s `WEB_ONLY_PACKAGES` had gone stale: elements / styler /
  rocketstyle / coolgrid gained native frontends and declare
  `multiplatform: { tier: 'shared' }`, and the native compiler carries
  `emit-rocketstyle.ts` / `parse-rocketstyle.ts` / `attrs-native.ts` for them —
  but they stayed listed, so the tri-target examples that exist to PROVE
  ui-system on native were reported as native-build hazards. A new drift test
  asserts the list mirrors the manifest tiers, because a hand-maintained mirror
  without one is a convention rather than a guard.

Also widens `pyreon/no-error-without-prefix` to accept the scoped
`[Pyreon <scope>]` form (`[Pyreon Router]`, `[Pyreon ISR]`), which the rule's own
comment already says is acceptable.
