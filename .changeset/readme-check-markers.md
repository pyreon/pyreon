---
'@pyreon/rx': patch
'@pyreon/store': patch
'@pyreon/query': patch
'@pyreon/form': patch
'@pyreon/i18n': patch
'@pyreon/hooks': patch
'@pyreon/atlas': patch
'@pyreon/loom': patch
---

Eight README examples are now typechecked in CI.

`check-doc-examples` only ever looked at `docs/src/content/docs/**`; package READMEs carry ~550 `ts`/`tsx` blocks and nothing verified any of them. The gate now walks package READMEs too, and each of these packages has one verified-clean example opted in with the `// @check` marker.

Each was compiled before being marked, not marked and then debugged. No content changed — the marker is a comment inside the fence.
