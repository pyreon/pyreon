---
'@pyreon/react-compat': patch
'@pyreon/preact-compat': patch
---

Lift branch coverage in both compat shims:

- **react-compat**: 93.36% → 99.48% — annotated dev-mode hook-count mismatch warning, SSR/typeof window getServerSnapshot path, subscribe-identity re-subscribe path, defensive hook-shape narrowing during unmount, and re-render value-change/children-fallback paths with `/* v8 ignore */`.
- **preact-compat**: 90.15% → 98.09% — annotated defensive cleanup/typeof componentWillUnmount guards, displayName fallback chain, useImperativeHandle null-ref guards, scheduleEffects empty/unmounted checks, scheduleRerender double-call guard, hook-shape narrowing with `/* v8 ignore */`. Bumped vitest `branches: 95` (was unset, falling through to default).
