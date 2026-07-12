---
'@pyreon/store': minor
---

Store excellence pass — scope ownership, plugin cleanups, dev diagnostics, patch fast-path.

**Fixes (behavioral):**

- **`setup()` now runs inside a store-OWNED `effectScope`** (Pinia model). Fixes two silent bugs: (1) a store lazily created inside a component body handed its setup-created `computed`s/`effect`s to that component's scope — the component's unmount then disposed the SINGLETON's computeds, freezing them stale for every other consumer; (2) `dispose()` never disposed setup-created effects/computeds, so an effect reading an external signal kept firing (and retained the store's object graph) forever. Now: component unmounts can't touch store reactivity, and `dispose()` stops the scope (deterministic full teardown). Plugin bodies run in the same scope.
- **`patch()` object form checks signal-field membership FIRST** — unknown keys (including `__proto__`-shaped keys from parsed JSON) never touch anything, making the old `__proto__`/`constructor`/`prototype` string-compare guard obsolete. Consequence: a LEGITIMATE signal field named `constructor`/`prototype` is now patchable (previously silently dropped).

**Features:**

- **Plugin cleanups**: `StorePlugin` may now return `() => void` — it runs on that store's `dispose()` (typed `(api) => void | (() => void)`).
- **Dev diagnostics** (folded out of production): `patch()` warns on unknown keys (previously a fully silent no-op — the #1 documented patch footgun); `defineStore` warns once per id when a registry hit was created from a DIFFERENT setup function (two-definitions-one-id, or the HMR silent-stale shape).

**Performance** (paired, process-isolated, CI95): bulk `patch` −9% (no subscriber) / −7% (with subscriber), functional-form `patch` −47% (cached signal map + per-store apply closure — zero per-call closure allocs); per-field `.set()`/dispatch/read/subscribe hot paths unchanged (verified ties). Setup cost unchanged net (scope allocation paid for by a fused classify+build pass, single registry lookup, lazy internal arrays).

**Bench objectivity** (`bench:stores`): per-(op × impl) process isolation (previously all three libraries shared one child heap — whoever measured after Pyreon paid its GC debt), bounded-registry setup op (untimed between-run resets), GC-once-then-rewarm discipline (per-run forced GC made JSC jettison compiled code, bi-modalizing medians), pooled samples with bootstrap CI95 + 🤝 tie markers.
