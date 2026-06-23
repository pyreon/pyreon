---
'@pyreon/validate': minor
---

`schema.is(input): boolean` — a pure boolean validity check (typia's `is<T>` analogue): `true` iff `input` is valid, cheaper than `.parse(...).ok` when you only need the verdict. It's also the runtime half of the compile-time fast path: an internal `_attachCompiledVerdict(fn)` hook lets `@pyreon/vite-plugin` attach `@pyreon/compiler`'s `emitValidator`-produced specialized verdict for EMITTABLE schemas, so `.is()` skips the runtime op-array entirely (the cross-runtime equivalence gate proves the verdict matches). Falls back to `.parse(input).ok` when no verdict is attached; the hook is dropped on any post-attach chained method so a stale verdict can never be used. `.is()` is sync-only — an async schema returns `false` (use `parseAsync`).
