---
'@pyreon/lint': patch
'@pyreon/compiler': patch
---

`pyreon/no-stale-for-item-field` and the `for-stale-item-field` detector (`pyreon check`, MCP `validate`, `pyreon doctor`) no longer report a field that the `<For>`'s `by` key reads. A key such as `` by={(r) => `${r.id}:${r.done}`} `` changes when `done` changes, so the row is rebuilt with the new item and `r.done` cannot go stale. Every read in the key counts: a template literal, a concatenation, an array `join`, a member chain (`r.meta.rev` covers `meta`), `r['done']`, a destructured key param, and a key function defined in the same file. A key that passes the whole item to something the check cannot see into (`keyOf(r)`, an imported `by={keyOf}`, `JSON.stringify(r)`) may read any field, so that `<For>` is no longer reported.
