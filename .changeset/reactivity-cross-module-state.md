---
'@pyreon/reactivity': patch
---

Harden `@pyreon/reactivity`'s 8 module-level state surfaces against the dual-module-instance bug class via `defineCrossModuleState` (extracted in the prior PR). State migrated:

- `tracking.ts` — `activeEffect`, `effectDeps`, `depsCollector`, `skipDepsCollection`, `prevEffect` (CRITICAL: every signal read/write touches these)
- `batch.ts` — `batchDepth`, `pendingRecomputes`, `pendingEffects`, `nextEffectPass`, `visitedThisPass`, `recomputes`
- `scope.ts` — `currentScope`
- `effect.ts` — `snapshotCapture`, `cleanupCollector`, `innerEffectCollector`, `userErrorHandler`
- `reactive-trace.ts` — `buf`, `count`
- `reactive-devtools.ts` — `active`, `nextId`, `byId`, `subId`, `finalizer`, `fireBuf`, `fireCount`
- `debug.ts` — `traceListeners`, `whyActive`, `whyLog`
- `lpih.ts` — `seq`

Without this, two `@pyreon/reactivity` module instances (Vite `[bare]` vs `[package entry]` resolvers, sub-dep version mismatches) silently break reactivity globally: an effect created under instance A reading a signal from instance B would set instance A's `activeEffect`, but instance B's `trackSubscriber` would read instance B's `activeEffect` (null) → subscription dropped → reactivity collapses with no error.

Byte-identical runtime behavior; 382 reactivity + 538 core + 681 runtime-dom + 150 runtime-server tests pass. Bisect-verified: changing any `Symbol.for` key name fails the corresponding regression spec.
