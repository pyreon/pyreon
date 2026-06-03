---
'@pyreon/coolgrid': patch
---

Lift branch coverage 92.1% → 100%. Annotated the three production-only NODE_ENV branches on `DEV_PROPS` ternaries in `Container/component.tsx`, `Row/component.tsx`, `Col/component.tsx` with `/* v8 ignore */` — production NODE_ENV is not exercised in dev-mode tests. Bumped vitest `branches: 90 → 95`.
