---
'@pyreon/table': patch
---

TanStack Table 9.0.0 → 9.1.2 (+ @tanstack/store 0.11.1). The Pyreon
reactivity bindings pass unchanged — 9.1's one seam addition, the optional
`commit` hook, is a render-phase-adapter API (`publishExternalState`'s
staged-options path) that a fine-grained adapter deliberately does not
implement: options are a real atom here (`createOptionsStore: true`), so
derived atoms subscribe reactively and there is no out-of-band invalidation
to signal. Rationale documented at the seam.
