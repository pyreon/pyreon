---
"@pyreon/lint": minor
---

Add `pyreon/prefer-isserver` (ssr category, recommended-level **warn**) — nudges toward the canonical `isServer` / `isClient` environment primitives from `@pyreon/reactivity` over hand-rolled `typeof window` / `typeof document` checks. The primitives single-source SSR detection and use the reliable `typeof document` discriminator (`typeof window` misreports DOM-less environments).

Advisory by design (warn never fails the errors-only lint gate) and self-gates on the project depending on `@pyreon/reactivity` / `@pyreon/core`, so it stays silent in non-Pyreon code. Flags the `typeof window/document … 'undefined'` idiom specifically (not `typeof window.foo` feature detection); the module that defines the primitives is exempt. Brings the rule set to 90.
