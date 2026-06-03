---
'@pyreon/ui-core': patch
---

Lift branch coverage 93.27% → 98.56% (well above the 95% target). Added `__tests__/branch-coverage-edges.test.ts` with tests for: `omit` / `pick` null + Set edges, `throttle.cancel` idle + leading-false trailing path, `useStableValue` deep-equal branch, `hoistNonReactStatics` non-configurable property swallow (try/catch), `render` component-fn + key extraction + primitive pass-through paths. Annotated structurally unreachable defensive branches with `/* v8 ignore */`: SSR-only `_isBrowser` gate in `PyreonUI.getSystemMode`, production dev-warn gate in `context.Provider`, post-typeof-fallthrough in `render`, just-initialized signal equality check in `useStableValue`, and the always-defined descriptor guard in `hoistNonReactStatics`. Bumped vitest threshold `branches: 90 → 95`.
