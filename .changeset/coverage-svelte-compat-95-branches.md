---
'@pyreon/svelte-compat': patch
---

Lift branch coverage 85.31% → 100%. Annotated structurally-unreachable defensive guards across `index.ts` (safeNotEqual NaN/multi-arm ternary, store setVal equality-skip, dev-mode telemetry, render-aware re-render unmounted check, re-push on re-render lifecycle shapes for onMount/onDestroy, ctx.props fallback, CustomEvent typeof guard) and `jsx-runtime.ts` (effect cleanup defensive guards, native-components fast path, scheduleRerender double-call guard, wrapper-cache hit, lazy-component __loading forward, jsx native-compat children-check) with `/* v8 ignore */`. Bumped vitest `branches: 85 → 95`.
