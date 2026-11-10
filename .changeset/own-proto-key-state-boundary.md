---
"@pyreon/router": patch
"@pyreon/server": patch
"@pyreon/store": patch
"@pyreon/state-tree": patch
---

An own `"__proto__"` key now keeps its shape when state crosses a boundary.

- `@pyreon/router`: new `stringifyLoaderDataForScript(data)` serializes loader data (or store state) for an executable `<script>window.X=…</script>` assignment. A JavaScript object literal treats a `"__proto__":` key as a prototype setter, so a user-keyed map holding that key lost it on the client and every missing-key lookup inherited its fields. The key is now emitted as the computed `["__proto__"]`; output without that key is byte-identical to `stringifyLoaderData`, which stays the JSON-text serializer for JSON responses.
- `@pyreon/server`: the loader-data and store-state scripts use it, and the island props codec keeps an own `__proto__` key in both directions instead of dropping it on encode and grafting it into the prototype on decode.
- `@pyreon/store`, `@pyreon/state-tree`: schema-mode `deepPatch` no longer turns a nested own `__proto__` key (from `JSON.parse`) into the merged object's prototype, which let the schema parse read optional fields the payload never contained.
