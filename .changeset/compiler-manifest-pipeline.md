---
'@pyreon/compiler': patch
'@pyreon/mcp': patch
---

Migrate `@pyreon/compiler` onto the manifest-driven docs pipeline.

`@pyreon/compiler` was the last core-layer package with NO `src/manifest.ts` — its `llms.txt` / `llms-full.txt` / MCP `api-reference.ts` surfaces did not exist at all (it was simply absent from every generated doc, and `get_api(compiler, …)` 404'd for the entire public surface including the Reactivity-Lens). This is the cause-level fix behind the "Lens docs enrichment" follow-up: the Lens couldn't be documented because the package it lives in wasn't on the pipeline.

**Added** `packages/core/compiler/src/manifest.ts` via `defineManifest()` — 18 `api[]` entries (the full public surface from `src/index.ts`): `transformJSX`, `transformJSX_JS`, `analyzeReactivity`, `formatReactivityLens`, `detectReactPatterns`, `migrateReactCode`, `hasReactPatterns`, `diagnoseError`, `detectPyreonPatterns`, `hasPyreonPatterns`, `auditTestEnvironment`, `formatTestAudit`, `auditIslands`, `formatIslandAudit`, `auditSsg`, `formatSsgAudit`, `transformDeferInline`, `generateContext`. Every entry carries an accurate `signature` + dense `summary`; the real foot-guns get `mistakes[]` (the dual-backend invisibility trap, the SSR-needs-`h()`-not-`_tpl()` trap, `knownSignals` cross-module seeding, the Lens asymmetric-precision contract, the enforced `fixable: false` invariant); `analyzeReactivity` / `formatReactivityLens` are flagged `stability: 'experimental'`; 3 package-level `gotchas` (dual backend, Lens is editor-only, detectors are not codemods).

**Wiring:** added `@pyreon/manifest` as a `workspace:*` devDependency on `@pyreon/compiler` (matches the `@pyreon/lint` convention — `manifest.ts` is gen-docs-only, never imported by `src/index.ts`, so it's tree-shaken from the published `lib/`). Added the `// <gen-docs:api-reference:start/end @pyreon/compiler>` marker pair to `packages/tools/mcp/src/api-reference.ts` (core-layer slot, between `@pyreon/core` and `@pyreon/router`). `bun run gen-docs` regenerated the `llms.txt` bullet, the `llms-full.txt` `## @pyreon/compiler` section, and the 18-entry MCP api-reference region; updated the hand-prose `## Core Framework` count 6 → 7.

**No runtime or API change** — purely additive doc-pipeline metadata. `gen-docs --check` in sync; lint 0 errors; typecheck clean (compiler + mcp); compiler 1053 tests, mcp 497, manifest 135 all green; `check-manifest-depth` passes (compiler enters at port-grade density and is intentionally NOT added to `LOCKED` — it's the visible migration backlog, not yet at flagship density). New `manifest-snapshot.test.ts` (5 specs) locks the rendered bullet/section/api-reference shape + the experimental-flag and foot-gun-catalog assertions locally in addition to the CI `Docs Sync` gate.
