---
'@pyreon/state-tree': patch
---

Schema-mode `.create()` and `reset()` no longer run `structuredClone` on primitive fields when capturing the reset baseline. Primitives are copied by value; object, array, Date, Map, Set and typed-array fields are still deep-cloned exactly as before. Provisional measurement (JSC, `create (schema)`, machine under load): about 18% faster `create`.
