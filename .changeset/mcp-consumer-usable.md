---
"@pyreon/mcp": minor
---

Make `@pyreon/mcp` fully usable in a consumer project via `bunx @pyreon/mcp` (the shipped `.mcp.json` config). Two fixes:

- **`typescript` is now a runtime dependency (was a peer).** The code-analysis tools (`validate`, `explain_reactivity`, `diagnose`, `migrate_react`, `migrate_pyreon`) call into `@pyreon/compiler`, which uses the TypeScript compiler API. In a `bunx` isolated env the peer wasn't installed, so those tools threw (`Cannot find package 'typescript'` / `Cannot read properties of undefined (reading 'ESNext')`). Declaring `typescript` as a dependency makes `bunx` install it alongside the compiler.
- **Doc/content tools now ship a bundled snapshot.** `get_pattern`, `get_anti_patterns`, and `get_changelog` read from monorepo files (`docs/src/content/docs/patterns/*.md`, `.claude/rules/anti-patterns.md`, `packages/**/CHANGELOG.md`) that don't exist in a consumer checkout — so they returned empty. The published package now includes a `content/` snapshot of those files (regenerated on every build via `scripts/copy-content.ts`). The loaders prefer the live monorepo source when present (in-repo dev sees the latest) and fall back to the bundled snapshot otherwise, so the tools return real content in consumers.
