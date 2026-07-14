---
"@pyreon/storage": patch
"@pyreon/mcp": patch
---

docs(storage): document the two missing public exports `removeStorage` and
`clearStorage` (both exported from index.ts but absent from api[]). Verified
against clear.ts: `removeStorage(key, { type? })` removes a single key and RESETS
its signal to the default (not undefined); `clearStorage(type = 'local' | 'all')`
clears only keys MANAGED by @pyreon/storage (NOT `localStorage.clear()` — unmanaged
keys are untouched) and resets each managed signal to its default. Documented the
real API asymmetry (removeStorage takes `{ type }` as an options object, clearStorage
takes the backend positionally). The `_reset*` exports are underscore-internal →
correctly excluded. Regenerates the MCP api-reference storage region + snapshot
(entry count 7 → 9). Docs/manifest only — no runtime behavior change.
