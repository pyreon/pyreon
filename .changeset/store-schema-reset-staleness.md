---
'@pyreon/store': patch
---

fix(store): schema-mode stores honor `resetStore(id)` instead of returning a stale wrapper

The schema-mode factory cached the `apiRef` wrapper in module-closure scope and short-circuited (`if (apiRef) return apiRef`) BEFORE querying the registry. After `resetStore(id)` dropped the inner store from the registry, the next call to the schema-store hook returned the SAME wrapper — still bound to the disposed inner. Every `.set()` / `.patch()` / `.reset()` routed through dead bindings: the fresh inner that `useInner()` would have rebuilt stayed unreachable, while user-visible reads on the cached wrapper appeared to "succeed" silently.

The setup-fn pipeline had no such bug — its hook queries `getRegistry()` on every call (the documented contract: "Destroy a single store by its ID. The next call to the store hook will re-run the setup function, producing fresh state"). Schema mode silently violated that contract from inception. Identified in the post v0.25.1 framework audit as bug class C (closure-pinned cache survives registry reset).

**Fix**: detect inner-identity change via `useInner()` (cheap Map lookup against the registry) and rebuild the wrapper only when the inner identity flips. Identity stability is preserved — repeated calls within the SAME inner instance still return the SAME wrapper (locked by the singleton-semantics regression spec at `schema-store.test.ts:452`, which would catch an accidental "just drop the cache" over-fix).

No public API surface change. The hook signature, return type, and identity-stability contract within a single inner instance are all unchanged. Only the post-`resetStore` correctness changes: schema stores now match the documented "fresh state after reset" contract that setup-fn stores already honored.

Bisect-verified-with-restore: 2 new regression specs in `packages/fundamentals/store/src/tests/schema-store.test.ts` under `schema-driven defineStore — resetStore (audit #3 regression)`:
1. **Spec A** (load-bearing): mutate → `resetStore(id)` → re-call hook → assert fresh initial values. With the identity-check block reverted, fails with `AssertionError: expected 'mutated' to be 'Alice'`.
2. **Spec B** (over-fix guard): three sequential `useStore()` calls return the same reference. Passes both pre-fix AND post-fix, proving the identity-stability contract survives the fix.

Restoring → 40/40 schema-store specs green, 132/132 full @pyreon/store suite green, typecheck green.
