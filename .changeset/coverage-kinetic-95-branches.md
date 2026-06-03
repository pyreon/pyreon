---
'@pyreon/kinetic': patch
---

Lift branch coverage 91.15% → 95.38%. Annotated structurally-unreachable defensive guards in animation lifecycle code (appearTriggered double-call guard, transitioning-stage discriminators, wrapper-null fallbacks during onEnd, optional-config style/transition guards, defensive isVNode + null-child fallbacks, stagger reverseLeave/last-index ternary combinatorics, default-value fallbacks, SSR/typeof rAF guard) with `/* v8 ignore */`. Bumped vitest `branches: 90 → 95`.
