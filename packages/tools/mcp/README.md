# @pyreon/mcp

MCP server for AI-assisted Pyreon development — API reference, validation, migration, project audits.

`@pyreon/mcp` is a Model Context Protocol server that gives AI coding assistants (Claude Code, Cursor, Windsurf, etc.) direct access to Pyreon's API reference + foot-gun catalogue + project audits. **21 tools** span discovery (`mcp_overview`), API lookup (`get_api`), static validation (`validate`, `explain_reactivity`), codemods (`migrate_react`, `migrate_pyreon`), error diagnosis (`diagnose`, `explain_error`), project introspection (`get_routes`, `get_components`), content navigation (`get_content_collection`, `get_content_entry`), proactive docs (`get_pattern`, `get_anti_patterns`, `get_changelog`), project-wide audits (`audit_test_environment`, `audit_islands`, `get_browser_smoke_status`), and workspace / component-catalog verification (`get_dependency_fabric`, `get_atlas_catalog`, `get_atlas_component`). Token-frugal by default: `get_anti_patterns` returns a compact index — kept at least ~60% smaller than the full catalogue by a density gate, not a pinned size (see `src/tests/token-budget.test.ts`).

## Install

```bash
bun add -D @pyreon/mcp
```

Or run on demand:

```bash
bunx @pyreon/mcp     # starts stdio MCP server
```

## IDE integration

### Claude Code

```jsonc
// .mcp.json (project root)
{
  "mcpServers": {
    "pyreon": {
      "command": "bunx",
      "args": ["@pyreon/mcp"]
    }
  }
}
```

### Cursor

```jsonc
// .cursor/mcp.json
{
  "mcpServers": {
    "pyreon": {
      "command": "bunx",
      "args": ["@pyreon/mcp"]
    }
  }
}
```

### Windsurf

```jsonc
// .windsurf/mcp.json  (same format)
{
  "mcpServers": {
    "pyreon": {
      "command": "bunx",
      "args": ["@pyreon/mcp"]
    }
  }
}
```

## Tools (21)

| Tool                        | Purpose                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `mcp_overview`               | Discoverability map: every tool's "when to use" + example, in one call — call this first                    |
| `get_api`                    | Look up any Pyreon API — signature, summary, example, common mistakes                                        |
| `validate`                   | Run `detectReactPatterns` + `detectPyreonPatterns` + `detectNativePatterns` against a code snippet           |
| `explain_reactivity`         | The compiler's per-expression reactivity VERDICT for a snippet (live / baked-static / footgun)               |
| `migrate_react`              | One-shot React → Pyreon codemod (`useState` → `signal`, `className` → `class`, …)                            |
| `migrate_pyreon`             | Auto-fixes the mechanically-safe Pyreon footguns (`sig(v)` → `sig.set(v)`, `<For key>` → `<For by>`, …)      |
| `diagnose`                   | Parse an error message into structured fix information; optional `componentSource` + `reactiveTrace`        |
| `explain_error`              | Assemble a failure dossier from a full error report (incl. reactiveTrace)                                    |
| `get_routes`                 | List routes detected in the current project                                                                  |
| `get_components`             | List components with their props + signals                                                                   |
| `get_content_collection`     | Enumerate `@pyreon/zero-content` collections, or one collection's entries                                    |
| `get_content_entry`          | Fetch one content entry's frontmatter + heading outline                                                       |
| `get_browser_smoke_status`   | Report which browser-categorized packages have `*.browser.test.{ts,tsx}` coverage                            |
| `get_pattern`                | Fetch a "how do I do X" pattern body from `docs/src/content/docs/patterns/<name>.md`                          |
| `get_anti_patterns`          | Browse the anti-patterns catalogue (compact index by default; drill in with `name`/`category`/`full: true`)  |
| `get_changelog`              | Recent release notes for a `@pyreon/*` package, parsed from `CHANGELOG.md`                                   |
| `audit_test_environment`     | Scan test files for mock-vnode patterns (PR #197 bug class)                                                   |
| `audit_islands`              | Project-wide islands audit (5 cross-file foot-guns)                                                            |
| `get_dependency_fabric`      | The `loom scan` workspace dependency graph — cycles, blast radius, gating findings                            |
| `get_atlas_catalog`          | The `atlas scan` verified component catalog — real props, allowed values, scenario verification counts       |
| `get_atlas_component`        | One catalogued component's exact prop values, reactive props, and a verified-or-labelled-unverified example  |

## Consumer usage (`bunx @pyreon/mcp`)

The server is designed to run standalone in a consumer project. Two things make that work:

- **`typescript` is a runtime dependency.** The code-analysis tools (`validate`, `explain_reactivity`, `diagnose`, `migrate_react`, `migrate_pyreon`) call into `@pyreon/compiler`, which needs the TypeScript compiler API. A `bunx` isolated install therefore pulls `typescript` in automatically — no peer-dependency setup required.
- **Doc/content tools ship a bundled snapshot.** `get_pattern`, `get_anti_patterns`, and `get_changelog` normally read from the Pyreon monorepo (`docs/src/content/docs/patterns/*.md`, `.agents/rules/anti-patterns.md`, `packages/**/CHANGELOG.md`). Those files don't exist in a consumer checkout, so the published package includes a `content/` snapshot of them (regenerated on every build). The loaders prefer the live monorepo source when present and fall back to the bundled snapshot otherwise — so the tools return real content in a consumer. The snapshot reflects the installed `@pyreon/mcp` version; upgrade the package to refresh it.

### `get_api`

```ts
get_api({ package: 'reactivity', symbol: 'signal' })
```

Returns signature + usage example + common mistakes. Covers every `@pyreon/*` package with a `manifest.ts` on the docs pipeline.

### `validate`

```ts
validate({ code: 'const { x } = props; return <div>{x}</div>' })
```

Merges three detectors (React anti-patterns + Pyreon-specific patterns + multiplatform/PMTC hazards), sorts by source line. `detectPyreonPatterns` ships 18 codes today: `for-missing-by`, `for-with-key`, `props-destructured`, `props-destructured-body`, `process-dev-gate`, `empty-theme`, `raw-add-event-listener`, `raw-remove-event-listener`, `date-math-random-id`, `on-click-undefined`, `signal-write-as-call`, `static-return-null-conditional`, `static-early-return-conditional`, `as-unknown-as-vnodechild`, `island-never-with-registry-entry`, `query-options-as-function`, `accessor-uncalled-in-template`, `accessor-uncalled-in-condition`. `detectNativePatterns` only fires when the snippet imports `@pyreon/primitives`.

`query-options-as-function` is **proactive**: the same rule ships as the opt-in `pyreon/query-options-as-function` lint rule AND as a `validate` detector — an AI agent calling `validate` sees the fix BEFORE commit, not just after running lint.

### `get_anti_patterns`

```ts
get_anti_patterns()                                    // compact index (paginated at 240 entries/page — likely "page 1 of N" on a catalog this size)
get_anti_patterns({ name: 'Destructuring props' })      // single entry, full body — cheapest drill-in (matches the entry TITLE, not the detector code)
get_anti_patterns({ category: 'reactivity' })           // category-scoped, full bodies — pass the SLUG, not the heading ("Reactivity Mistakes" → 'reactivity')
get_anti_patterns({ full: true })                       // entire catalog (many tens of thousands of tokens) — explicit opt-in
```

`category` accepts one of 15 slugs: `reactivity`, `jsx`, `context`, `architecture`, `islands`, `ssr`, `ssg`, `bundling`, `testing`, `lifecycle`, `build`, `ci`, `best-practices`, `library-api`, `documentation` (plus `all`). The default index keeps `## <Heading>` markers so categories stay discoverable. Each entry surfaces its `[detector: <code>]` tag inline so an agent can pair the catalog entry with the live static detector.

A `token-budget.test.ts` regression gate keeps `tools/list` and the index DENSITY-bounded (average + max tokens per tool/entry, not an absolute total) and pins `get_anti_patterns({})` at least ~60% smaller than `{ full: true }`, plus a 12,000-token design-boundary tripwire on the index (past that the fix is pagination, not a bigger number).

### `get_pattern`

```ts
get_pattern({ name: 'reactive-spread' })
```

Serves `docs/src/content/docs/patterns/<name>.md` from the monorepo, or the package's **bundled snapshot** when run in a consumer (see "Consumer usage" below). Foundational patterns today: `controllable-state`, `data-fetching`, `dev-warnings`, `dynamic-fields`, `event-listeners`, `form-fields`, `imperative-toasts`, `islands`, `keyed-lists`, `multiplatform`, `reactive-context`, `reactive-spread`, `routing-setup`, `signal-writes`, `ssr-safe-hooks`, `state-management`, `styler-theming`. Add a new pattern by dropping a new `docs/src/content/docs/patterns/<slug>.md` file.

### `migrate_react`

```ts
migrate_react({ code: "import { useState } from 'react'\nconst [c, setC] = useState(0)" })
```

One-shot codemod — `useState` → `signal`, `useEffect` → `effect`, `useMemo` → `computed`, `className` → `class`, `htmlFor` → `for`. Not a runtime adapter; for that see `@pyreon/react-compat`.

### `explain_reactivity`

```ts
explain_reactivity({ code: 'function Cart(props) {\n  const { qty } = props\n  const price = signal(9.99)\n  return <div>{qty} × {price()}</div>\n}' })
```

Surfaces the compiler's OWN per-expression reactivity verdict (`analyzeReactivity`) — every JSX expression tagged `live` / `live prop` / `live attr` / `baked once` / `hoisted static`, merged with `detectPyreonPatterns` footguns. Where `validate` reports bugs, this reports the whole map — a binding that will silently never update shows as `baked once` even when no detector fires on it.

### `migrate_pyreon`

```ts
migrate_pyreon({ code: "const count = signal(0)\ncount(1)\nconst list = <For each={a} key={k}>{i => <li />}</For>" })
```

The Pyreon → correct-Pyreon codemod. Auto-fixes ONLY the three mechanically-safe footguns (`sig(v)` → `sig.set(v)`, `<For key>` → `<For by>`, `x as unknown as VNodeChild` → `x`) and returns every other detected footgun as a `remaining` list for a human. Span-based + idempotent — safe to apply verbatim.

### `get_content_collection` / `get_content_entry`

```ts
get_content_collection()                                          // list every @pyreon/zero-content collection
get_content_collection({ name: 'docs' })                           // one collection's entries
get_content_entry({ collection: 'docs', slug: 'getting-started' }) // one entry's frontmatter + heading outline
```

Reads the project's `content.config.{ts,mts,js,mjs}` from `process.cwd()`. With no `content.config.*` present the tool answers "No content.config found" rather than an empty list, so the miss is distinguishable from a collection with zero entries.

### `get_changelog`

```ts
get_changelog({ package: 'query', limit: 5, since: '0.12.0', includeDependencyUpdates: false })
```

Parses `packages/**/CHANGELOG.md` into structured version entries — or the package's **bundled snapshot** when run in a consumer (see "Consumer usage" below). Default `limit: 5`, `includeDependencyUpdates: false` (filters out ceremonial dep-bump-only releases). Accepts both `"query"` and `"@pyreon/query"`.

### `audit_test_environment`

```ts
audit_test_environment({ minRisk: 'high', limit: 20 })
```

Scans every `*.test.ts(x)` under `packages/` for mock-vnode patterns — tests constructing `{ type, props, children }` literals instead of going through real `h()` from `@pyreon/core`. Three risk tiers from the balance of mock-vnode literals + helper calls vs `h()` calls. Use before modifying an existing test, or after a framework change to audit for the PR #197 bug class.

### `audit_islands`

```ts
audit_islands()
```

Project-wide cross-file islands audit. Five detectors: `duplicate-name` / `never-with-registry-entry` / `registry-mismatch` / `nested-island` / `dead-island`. Each finding ships with file path + line/column + actionable fix.

### `get_dependency_fabric`

```ts
get_dependency_fabric({})                              // whole-fabric overview: shape, cycles, blast radius
get_dependency_fabric({ package: '@pyreon/router' })    // one package's deps, dependents, depth, reach, findings
```

Serves the `loom-report.json` a `loom scan` writes — never re-runs the scan itself (a full workspace walk on every call would make each question pay for it). Every rendering carries loom's honesty rule: it reads DECLARED truth (manifests + source imports), never a lockfile or the registry, so it cannot say which version is installed, and `unused-dep` findings are lexical evidence, not proof. Missing report → instructions to run `loom scan`, not an invented graph.

### `get_atlas_catalog` / `get_atlas_component`

```ts
get_atlas_catalog({})                        // every component: props, allowed values, scenario verification counts
get_atlas_catalog({ tag: 'form' })            // filtered by tag
get_atlas_component({ name: 'Button' })       // one component's exact prop values + a verified example
```

Serves the `atlas-catalog.json` an `atlas scan` writes. Each catalog line carries THREE scenario counts — verified / failing / unverified — because most Atlas checks are still stubs; a catalogued component is not automatically a checked one. `get_atlas_component` labels an example `(UNVERIFIED …)` when nothing has actually checked it, rather than presenting it as correct. Missing catalog → instructions to run `atlas scan`, not a guessed answer.

## Programmatic API

The package is primarily a binary (`pyreon-mcp`); the main entry exports no runtime symbols (it boots the server on import via `main()`). `createServer()` is exported for embedding — build a `McpServer` and connect it to any transport (the test suite uses this with `InMemoryTransport` instead of stdio). For the static analysis directly, `@pyreon/mcp` re-uses `@pyreon/compiler`'s `detectReactPatterns` / `detectPyreonPatterns` / `detectNativePatterns` / `migrateReactCode` / `migratePyreonCode` / `diagnoseError` / `auditIslands` + `formatIslandAudit` / `auditTestEnvironment` + `formatTestAudit` / `auditSsg` — import from `@pyreon/compiler` directly if you want the raw detector output instead of the MCP text formatting.

## Gotchas

- **`get_anti_patterns` defaults to the compact index** to stay under MCP-client token budgets. Drill in with `{ name }` (cheapest) or `{ category }`; `{ full: true }` is the explicit opt-in for the entire catalog.
- **`validate` is reactive**, `get_pattern` + `get_anti_patterns` are **proactive** — call them BEFORE writing.
- **`get_api` only covers packages on the manifest/MCP pipeline.** 57 of 76 published packages have a `manifest.ts` today (see AGENTS.md "Manifest-driven docs pipeline" for the live count); un-migrated packages are absent from the surface (NOT a 404 — they're simply missing).
- **`get_routes` / `get_components`** require running inside a Pyreon project root (they scan the filesystem).
- **`get_dependency_fabric` / `get_atlas_catalog` / `get_atlas_component`** read build ARTIFACTS (`loom-report.json` / `atlas-catalog.json`), not the live source. Run `loom scan` / `atlas scan` first, or the tool returns setup instructions instead of an invented answer.

## Documentation

Full docs: [pyreon.dev/docs/mcp](https://pyreon.dev/docs/mcp) (or `docs/src/content/docs/mcp.md` in this repo).

## License

MIT
