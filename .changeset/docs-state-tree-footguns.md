---
"@pyreon/state-tree": patch
"@pyreon/mcp": patch
---

docs(state-tree): source-verified `mistakes[]` + a missing public export + two
doc-bug fixes. Added `resetHook`/`resetAllHooks` to api[] (exported from index.ts
but absent — the `.asHook(id)` singleton test-isolation footgun). Enriched
mistakes[] (11 → 15 blocks): applyPatch (REPLACE-ONLY — throws `unsupported op` on
add/remove, verified patch.ts), getSnapshot (non-reactive peek; recurses
arrays-of-instances), applySnapshot (partial MERGE not wholesale; in-place array
reconcile up to overlap; schema mode re-validates + rejects). Fixed two stale
claims caught by verifying against source: the `reference` mistake said "getSnapshot
v1 does not recurse arrays-of-instances" (snapshot.ts now DOES) and applySnapshot's
summary said "wholesale" (it's a partial merge — `Partial<Snapshot>`, absent keys
preserved). Regenerates the MCP api-reference state-tree region + snapshot test
(entry count 20 → 21). Docs/manifest only — no runtime behavior change.
