---
"@pyreon/feature": patch
---

Remove the redundant local `hasStandardSchema` duck-type in `@pyreon/feature` and route Standard-Schema detection through `@pyreon/validation`'s exported `isStandardSchema`.

The local workaround existed ONLY because validation's `isStandardSchema` used to carry an over-narrow `typeof value !== 'object'` guard that silently rejected callable ArkType schemas (`type(...)` returns a FUNCTION carrying `~standard`). #2243 fixed that guard to accept `typeof === 'object' || 'function'`, so the two functions are now behaviorally identical and the local copy is dead weight. This completes the ArkType raw-schema detection arc (#2242 → #2243 → #2253).

No behavior change — a raw callable ArkType schema is still detected and produces validation (locked by the existing `schema-validators.test.tsx` ArkType case, bisect-verified against a narrowed object-only guard).
