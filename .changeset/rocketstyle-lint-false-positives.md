---
"@pyreon/rocketstyle": patch
---

Internal lint hygiene: suppress 2 `pyreon/no-unbatched-updates` false positives in `rocketstyle.ts`.

The `.set()` calls in `EnhancedComponent` and `_resolveRsEntry` are WeakMap/SizedMap CACHE writes (ThemeManager tiers, `_dimensionsCache`, `_rsMemo`) — not reactive signal updates — so `batch()` does not apply. Each site now carries a `pyreon-lint-disable-next-line` with the rationale, and the `pyreon-lint-baseline.json` ratchet is tightened accordingly (`no-unbatched-updates` 15 → 13, total 113 → 111). Comment-only in source; no runtime, type, or API change for consumers.
