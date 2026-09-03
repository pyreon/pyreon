---
'@pyreon/native-compiler': patch
---

`db.insert(collection, { id, description, amount })` — the flat domain object shape people naturally write, and the exact shape `native-finance`'s own showcase hit before retreating to string-keyed ops — fell through to the generic struct-synthesis path with zero warning. That path successfully synthesizes a real, compiling struct whenever the fields are individually typeable (a flat object of strings/numbers is the common case, not an edge case), so `warnUntypeableObjectLiteral` never fired: its question is "could a struct be synthesized at all", and the answer here is yes. The struct just isn't `PyreonRecord`, the nominal type `insert`'s real signature requires on both targets, so the call is guaranteed to fail the build — verified by compiling against the real stubs, not by reading the emit.

`db.insert(collection, { id, fields: { ...columns } })` still lowers to a real `PyreonRecord` and is unaffected. Any other shape now warns by name, naming exactly which fields aren't `id`/`fields`, before falling through.
