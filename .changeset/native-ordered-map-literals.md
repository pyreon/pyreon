---
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/hooks': patch
'@pyreon/query': patch
---

iOS: a `Map` / `Record` iterates in insertion order everywhere. A seeded `new Map([[k, v], …])` or a `Record` literal in an unannotated local was emitted as a Swift `Dictionary` (hash order, different on every launch; a repeated key crashed), and a `Record` decoded from JSON (`JSON.parse`, a fetch / query body) lost the document's key order. Map literals are now typed `PyreonMap` by themselves, and every emitted decode goes through `PyreonJSON.decode`, which keeps each object's key order.
