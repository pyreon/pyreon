---
'@pyreon/native-compiler': patch
---

Component-scope flat array destructure (`const [a, b] = xs()`) now lowers on
both native targets — it was the last silent destructure drop. The declaration
fell through the parser's name-based bail (an ArrayPattern id has no `.name`)
and vanished with zero warnings, so the emitted Swift/Kotlin referenced
`a`/`b` unbound and failed the platform compiler with "cannot find 'a' in
scope" while the transform reported success. Function/computed-body array
destructure already lowered; only the component-body form was affected.

The lowering mirrors the component-level object arm: a synthetic container
const (`__pyDestrN = xs()`) plus per-element index aliases (`a` →
`__pyDestrN[0]`), the exact IR of the documented explicit-index shape
(`xs()[0]`), so emit and type inference ride a proven path on both targets.

Non-simple patterns — holes (`[, b]`), rest (`[...r]`), defaults (`[a = 1]`),
nested — now fail with a NAMED warning at component scope, and the same loud
residual covers non-simple component-level OBJECT patterns, which previously
also vanished silently. The declaration is skipped whole, never half-bound.

Regression-locked in `native-array-destructure-component-scope.test.ts`
(emit-shape both targets + real `swiftc -typecheck` + real `kotlinc`),
bisect-verified: reverting the parse arm fails 6/7 specs with the exact
`cannot find 'a' in scope` typecheck error.
