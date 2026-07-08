---
"@pyreon/store": minor
---

Schema-driven stores are now **strictly typed from the schema end-to-end.** The consumer-facing `SchemaStoreApi` previously degraded to `Record<string, unknown>` / `unknown` on `set` / `patch` / `deepPatch` / `update` / `state`; it now infers every field type from the schema (`InferSchema<S>`), with zero manual annotations and no casts:

- `state` — the typed field-value snapshot (`InferSchema<S>`).
- `set(next)` — requires the full schema shape.
- `patch(partial)` — a typed `Partial`.
- `deepPatch(partial)` — a typed `DeepPartial`.
- `update(key, current => next)` — `key` is constrained to the schema FIELD names (setup-returned actions/computeds are rejected), and the transformer receives + returns the field's exact type `TRaw[K]`.

This is a **types-only** change — the runtime already validated every write through the schema; only the compile-time surface got stricter. `SchemaStoreApi` now takes two type params, `SchemaStoreApi<TRaw, TStore = SignalsOf<TRaw>>`. Code that relied on the old loose types (e.g. `update`'s `unknown` transformer, or `update`-ing a computed key) will now fail typecheck — that's the point; remove the now-unneeded casts.
