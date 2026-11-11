---
"@pyreon/vue-compat": patch
---

`readonly()` and `shallowReadonly()` now reject every write path, not only assignment and `delete`. `Object.defineProperty`, `Object.setPrototypeOf` and `Object.preventExtensions` (and so `Object.freeze` / `Object.seal`) on a readonly proxy, or on a nested readonly proxy, passed straight through to the source object and mutated it; they now throw a `[Pyreon]` error like a readonly assignment does. A descriptor read (`Object.getOwnPropertyDescriptor(ro, 'nested').value`) now returns the nested object as readonly instead of the raw, writable source.
