---
"@pyreon/compiler": patch
"@pyreon/mcp": patch
"@pyreon/cli": patch
"@pyreon/typescript": patch
---

Cap the `typescript` dependency range to `>=5.0.0 <7.0.0` so a fresh install no longer resolves TypeScript 7.

**The bug this fixes:** `@pyreon/compiler`'s detectors, audits, and migrators parse with the classic Compiler API (`ts.createSourceFile(f, code, ts.ScriptTarget.ESNext, …)`). TypeScript 7 ("tsgo", the native preview now published as `latest` on npm) REMOVED that API — `ts.ScriptTarget` is `undefined` there, so parsing throws the cryptic `Cannot read properties of undefined (reading 'ESNext')`. Because `@pyreon/mcp`/`@pyreon/compiler`/`@pyreon/cli` declared `typescript` with an uncapped `>=5.0.0` range, a fresh `bunx @pyreon/mcp` (or any clean install) pulled TS7 and every TS-backed tool (`validate` / migrate / audit) crashed, while a project pinned to 5.x/6.x worked. Capping `<7` keeps installs on the working classic-API 6.x line (the project's supported TypeScript).

Also:
- `@pyreon/compiler` now declares `typescript` as a real **dependency** (was a peer) — its shipped `lib` unconditionally imports it and calls the classic Compiler API, so consumers (including `bunx`/`npx` runs of `@pyreon/mcp`) get a working TypeScript without relying on peer auto-install.
- Added a self-diagnosing guard (`assertClassicTs()`, `@pyreon/compiler`): if a project force-pins TypeScript 7 anyway, parse paths now fail with an actionable `[Pyreon]` message ("needs TypeScript 5.x or 6.x … pin `>=5.0.0 <7.0.0`") instead of the mystifying `undefined.ESNext`. It's a plain function (not an import-time check), so importing `@pyreon/compiler` never throws and the MCP server + non-parsing tools stay up.
