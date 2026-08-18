---
'@pyreon/compiler': minor
---

Compiled templates now chain sibling refs instead of re-walking from the parent, making a K-child template cost O(K) DOM property reads instead of O(K²).

`childNodeAccessor` built every child ref as an independent walk — `__root.firstElementChild`, `__root.firstElementChild.nextElementSibling`, … — so child N cost N+1 pointer reads and an 8-cell row cost 36 reads where 15 would do. Nesting compounded it, because a non-dynamic element passed its own full walk down as its children's base. Each phase-1 capture now chains off the nearest node another phase-1 const already holds.

This is safe by construction rather than by care: chaining is applied ONLY to expressions emitted into phase 1 (`refLines`), every one of which is captured from the pristine clone before any phase-2 mutation runs, so `__e0.nextElementSibling` and the long walk are the same node. Phase-2 expressions are untouched. The `children[]` indexed-getter cutoff still applies — it is now measured against the hop count AFTER shortening, so a far sibling reached in one hop from a captured neighbour keeps the cheaper chain.

Mirrored byte-identically in both backends (JS + Rust), locked by the existing cross-backend equivalence and differential-fuzz suites.

Measured, production build, real Chromium, 2,000 rows x 8 cells, JS half only: 4,443ns/row -> 3,917ns/row. On the two-cell krausest-style row the saving is one pointer read per row and is below that benchmark's noise floor — this is a win for the wide rows real apps render, and is reported as such.
