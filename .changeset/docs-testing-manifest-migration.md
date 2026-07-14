---
"@pyreon/testing": patch
"@pyreon/mcp": patch
---

docs(testing): migrate @pyreon/testing to the manifest-driven docs pipeline (the
last real-API package without a manifest — 51 → 52 manifests). Adds
`src/manifest.ts` documenting the 7 Pyreon-native APIs (render / cleanup /
renderHook + the reactive-graph matchers expectSignal / expectEffect /
expectGarbageCollected / expectNoReactiveLeak) with source-verified footguns —
including that render's queries bind to `baseElement` not `container`, cleanup is
NOT auto-registered without the `/vitest` setup entry, renderHook runs the hook
ONCE (Pyreon semantics), expectSignal's two matchers are the same check, and the
GC matchers require `--expose-gc` — plus one grouped entry for the verbatim
@testing-library/dom re-exports. Wires it into gen-docs (llms.txt / llms-full.txt /
MCP api-reference), adds the @pyreon/manifest devDep + a manifest-snapshot test.
Docs/manifest only — no runtime behavior change.
