---
'@pyreon/lint': patch
'@pyreon/compiler': patch
---

`pyreon/no-stale-for-item-field` and the `for-stale-item-field` detector (`pyreon check`, MCP `validate`, `pyreon doctor`) no longer report a value that the `<For>`'s `by` key reads. A key such as `` by={(r) => `${r.id}:${r.done}`} `` changes when `done` changes, so the row is rebuilt with the new item and `r.done` cannot go stale. Every read in the key counts: a template literal, a concatenation, an array `join`, `r['done']`, a destructured key param, `const { id } = r` in the key body, and a key function declared in scope. The match is by exact path: a key on `r.node.id` does not cover a row's `r.node.title`, and `${r.meta}` (an object) covers none of `meta`'s fields. A key that changes on any replacement (`(r) => r`, `JSON.stringify(r)`) silences the `<For>`. A key the check cannot see into (an imported `keyOf`, `(r) => keyOf(r)`, `keyBy('id')`) still reports, and the message says the read is safe only if that function reads the field.
