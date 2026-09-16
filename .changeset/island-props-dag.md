---
'@pyreon/server': patch
---

Stop treating a shared reference in island props as a circular one

`encodeIslandProps` tracked every object it had ever visited and never pruned it,
so a DAG — one object referenced twice, which `JSON.stringify` handles fine — was
reported as a circular reference. `{ author: user, lastEditor: user }`, a list
whose rows share a lookup object, and a shared `Date` are all ordinary island
props, and all were rejected.

Because both callers catch (an island must never 500 the SSR), the failure was
not an error anyone saw: production hydrated the island with EMPTY PROPS, with
only a dev-mode `console.error` explaining why. Detection now tracks the ancestor
path — added on descend, removed on ascend — so only a genuine self-reference
throws. This is the same defect, and the same fix, as `stringifyLoaderData` in
`@pyreon/router`.
