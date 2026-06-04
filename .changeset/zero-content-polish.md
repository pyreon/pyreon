---
'@pyreon/zero-content': minor
---

zero-content PR 9: JSX handoff fix (closes PR 7 spike finding) + polish.

PR 7's docs-pyreon migration spike surfaced that `.md` → emitted JSX wasn't being further compiled to JS by downstream tooling — the file's `.md` extension prevented Rolldown from enabling JSX parsing. The result was a hard build failure on every consumer of `@pyreon/zero-content` that emitted any structural JSX.

Changes:

- **JSX → JS compilation in the plugin's `transform`** (`src/plugin.ts`). After `compileMarkdown` emits Pyreon JSX, the plugin runs an esbuild pass converting it to plain `h(...)` / `Fragment` calls with an automatic `import { h, Fragment } from '@pyreon/core'` banner. Downstream tooling sees plain JS; the `.md` extension is no longer a parsing constraint. The Pyreon `h` shape matches React's `createElement` signature, so the esbuild-emitted output works unmodified at runtime.
- **`compileJsx?: boolean`** plugin option (default `true`). Tests assert on the raw emit-jsx output via `compileJsx: false`; production builds always want the compiled form (default).
- **`as const` stripped** from the virtual components module body — esbuild + bare Rolldown parsers don't accept TS-only syntax in user-loaded modules. The runtime shape is unchanged.
- **`esbuild` moved from peerDeps assumption to a direct dep**. Vite already ships esbuild, so the marginal impact on install footprint is zero.

The `examples/docs-pyreon` consumer's `bun run build` now completes successfully end-to-end (see PR 7 — re-tested post-fix, prod bundle includes the migrated `reactivity.md` as a route-split chunk).

382/382 specs passing. 11/11 validate-fast gates. typecheck + lint clean.

**Still deferred** (open items for follow-up PRs):
- **MCP integration** (`get_content_collection` / `get_content_entry` MCP tools) — out of scope for this PR; tracked separately.
- **`pyreon doctor --check-content`** — out of scope for this PR.
- **Real-Chromium e2e gate** against a rendered MDX page — PR 7's example builds now; a follow-up adds the gate.
- **The `<Playground>` native-mode escape** — current iframe-sandbox approach works; native mode is an enhancement.
