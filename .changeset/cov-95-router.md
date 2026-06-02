---
"@pyreon/router": patch
---

test(router): cover loader.ts toJSON-returning-primitive + NotFoundBoundary re-throw — 94.93 → 95.09

Two focused test additions close the gap to 95:

- `loader.ts` line 140: `detectCycle` early-returns when an object's
  `toJSON()` returns a primitive (Date is the canonical case — `toJSON`
  returns a string, so the cycle detector must NOT recurse into a
  non-existent ancestor chain). Added test using Date + a custom
  `toJSON() → number`.
- `not-found.ts` line 64: `NotFoundBoundary`'s fallback re-throws when
  the caught error isn't a `notFound()` error. Without this branch, a
  real bug inside the boundary would silently render the 404 fallback,
  masking the error. Added test asserting the notFound fallback does
  NOT render when a regular Error is thrown.

Statements: 94.93% → 95.09% (now passes the 95 threshold).
Threshold bumped 94 → 95.
