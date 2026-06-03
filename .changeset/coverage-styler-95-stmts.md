---
'@pyreon/styler': patch
---

Lift statement coverage 94.83% → 95.89% and drop `@pyreon/styler` from `BELOW_FLOOR_EXEMPTIONS`. Added `__tests__/coverage-edges.test.ts` covering: (a) the `WeakMap` fallback cache hit path in `createStyledComponent` (alternating same-strings + different-tag pattern), (b) the `styled` Proxy guards for `prototype` / `$$typeof`, (c) per-tag factory caching identity. Vitest threshold `statements: 94 → 95`.
