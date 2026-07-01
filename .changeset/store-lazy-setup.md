---
'@pyreon/store': patch
---

perf(store): trim per-store `setup` cost — lazy `signalKeySet` + array-backed initial values

Two allocation deferrals on the store-creation path, both feature-preserving and
mirroring the existing lazy-`subscribers` precedent:

- **`signalKeySet` is now lazy** — the `Set<signalKey>` used for `patch()`
  object-form membership is allocated on the FIRST `patch()` call and reused
  thereafter, instead of eagerly at creation. Most stores mutate via
  `store.x.set()` / actions and never call `patch()`, so the Set was pure setup
  overhead for them. The patch hot path stays O(1) after the first call (built
  once, amortized).
- **Initial values are captured into a parallel array** aligned with
  `signalKeys` instead of a `Map`. An array is cheaper to build on the setup
  path; `reset()` — the sole consumer — zips the two by index. (The snapshot
  must happen at creation, so unlike `signalKeySet` it can't be deferred.)

Measured (paired, per-op process isolation, median): `setup` ~17× → ~12.7×
vs Zustand (~730ns → ~665ns). Every other op is unchanged (read / dispatch /
write / patch all within noise); 151 store tests pass; typecheck clean.

This narrows the once-per-store `setup` gap without touching the registry,
per-field signals, or bound-method API — the features that win the hot path
(dispatch ~6×, write ~1.7×, patch ~1.2× vs Zustand). It does NOT overtake
Zustand's bare-closure `setup`; that gap is architectural (Pyreon's global
singleton registry powers SSR isolation / devtools / `resetAllStores`, which
Zustand has no equivalent of).
