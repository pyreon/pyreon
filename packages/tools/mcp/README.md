# @pyreon/mcp

MCP server for AI-assisted Pyreon development — API reference, validation, migration, project audits.

`@pyreon/mcp` is a Model Context Protocol server that gives AI coding assistants (Claude Code, Cursor, Windsurf, etc.) direct access to Pyreon's API reference + foot-gun catalogue + project audits. Tools include `get_api` (look up any `@pyreon/*` symbol with signature + foot-gun list), `validate` (run two anti-pattern detectors against a snippet), `migrate_react` (one-shot React → Pyreon codemod), `get_pattern` + `get_anti_patterns` (proactive — fetch the canonical pattern before writing), `get_changelog` (recent release notes), `audit_*` (project-wide audits surfaced from `@pyreon/compiler`), and `explain_error` (assemble a failure dossier). Token-frugal by default: `get_anti_patterns` returns a compact index (≈3.3K tokens) instead of the full catalogue (≈14K).

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

## Tools (14)

| Tool                       | Purpose                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `mcp_overview`             | Discoverability map: every tool's "when to use" + example, in one call                   |
| `get_api`                  | Look up any Pyreon API — signature, summary, example, common mistakes                    |
| `validate`                 | Run `detectReactPatterns` + `detectPyreonPatterns` against a code snippet                |
| `migrate_react`            | One-shot React → Pyreon codemod (`useState` → `signal`, `className` → `class`, …)        |
| `diagnose`                 | Parse an error message into structured `{ pattern, fix, link }`                          |
| `explain_error`            | Assemble a failure dossier from a full error report (incl. reactiveTrace)                |
| `get_routes`               | List routes detected in the current project                                              |
| `get_components`           | List components with their props + signals                                               |
| `get_browser_smoke_status` | Report which browser-categorized packages have `*.browser.test.{ts,tsx}` coverage        |
| `get_pattern`              | Fetch a "how do I do X" pattern body from `docs/patterns/<name>.md`                      |
| `get_anti_patterns`        | Browse the anti-patterns catalogue (compact index by default; drill in with `name`/`category`/`full: true`) |
| `get_changelog`            | Recent release notes for a `@pyreon/*` package, parsed from `CHANGELOG.md`               |
| `audit_test_environment`   | Scan test files for mock-vnode patterns (PR #197 bug class)                              |
| `audit_islands`            | Project-wide islands audit (5 cross-file foot-guns)                                      |

### `get_api`

```ts
get_api({ package: 'reactivity', symbol: 'signal' })
```

Returns signature + usage example + common mistakes. Covers every `@pyreon/*` package with a `manifest.ts` on the docs pipeline.

### `validate`

```ts
validate({ code: 'const { x } = props; return <div>{x}</div>' })
```

Merges two detectors (React anti-patterns + Pyreon-specific patterns), sorts by source line. `detectPyreonPatterns` ships 15 codes today: `for-missing-by`, `for-with-key`, `props-destructured`, `props-destructured-body`, `process-dev-gate`, `empty-theme`, `raw-add-event-listener`, `raw-remove-event-listener`, `date-math-random-id`, `on-click-undefined`, `signal-write-as-call`, `static-return-null-conditional`, `as-unknown-as-vnodechild`, `island-never-with-registry-entry`, `query-options-as-function`.

`query-options-as-function` is **proactive**: the same rule ships as the opt-in `pyreon/query-options-as-function` lint rule AND as a `validate` detector — an AI agent calling `validate` sees the fix BEFORE commit, not just after running lint.

### `get_anti_patterns`

```ts
get_anti_patterns()                                // compact index (~3.3K tokens)
get_anti_patterns({ name: 'props-destructured' })  // single entry, full body — cheapest drill-in
get_anti_patterns({ category: 'Reactivity Mistakes' })   // category-scoped, full bodies
get_anti_patterns({ full: true })                  // entire catalog (~14K tokens) — explicit opt-in
```

The default index keeps `## <Heading>` markers so categories stay discoverable. Each entry surfaces its `[detector: <code>]` tag inline so an agent can pair the catalog entry with the live static detector.

A `token-budget.test.ts` regression gate pins `tools/list` < 1,300 tokens and `get_anti_patterns({})` < 5,000.

### `get_pattern`

```ts
get_pattern({ name: 'reactive-spread' })
```

Serves `docs/patterns/<name>.md` from the monorepo. Foundational patterns today: `controllable-state`, `data-fetching`, `dev-warnings`, `dynamic-fields`, `event-listeners`, `form-fields`, `imperative-toasts`, `islands`, `keyed-lists`, `reactive-context`, `reactive-spread`, `routing-setup`, `signal-writes`, `ssr-safe-hooks`, `state-management`, `styler-theming`. Add a new pattern by dropping a new `docs/patterns/<slug>.md` file.

### `migrate_react`

```ts
migrate_react({ code: "import { useState } from 'react'\nconst [c, setC] = useState(0)" })
```

One-shot codemod — `useState` → `signal`, `useEffect` → `effect`, `useMemo` → `computed`, `className` → `class`, `htmlFor` → `for`. Not a runtime adapter; for that see `@pyreon/react-compat`.

### `get_changelog`

```ts
get_changelog({ package: 'query', limit: 5, since: '0.12.0', includeDependencyUpdates: false })
```

Parses `packages/**/CHANGELOG.md` into structured version entries. Default `limit: 5`, `includeDependencyUpdates: false` (filters out ceremonial dep-bump-only releases). Accepts both `"query"` and `"@pyreon/query"`.

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

## Programmatic API

The package is primarily a binary (`pyreon-mcp`); the main entry exports no runtime symbols (it boots the server on import via `main()`). Use `@pyreon/compiler` directly for `detectReactPatterns` / `detectPyreonPatterns` / `migrateReactCode` / `diagnoseError` / `auditIslands` / `auditTestEnvironment` / `auditSsg`.

## Gotchas

- **`get_anti_patterns` defaults to the compact index** to stay under MCP-client token budgets. Drill in with `{ name }` (cheapest) or `{ category }`; `{ full: true }` is the explicit opt-in for the entire catalog.
- **`validate` is reactive**, `get_pattern` + `get_anti_patterns` are **proactive** — call them BEFORE writing.
- **`get_api` only covers packages on the manifest/MCP pipeline.** ~33 of 56 published packages have a `manifest.ts` today; un-migrated packages are absent from the surface (NOT a 404 — they're simply missing).
- **`get_routes` / `get_components`** require running inside a Pyreon project root (they scan the filesystem).

## Documentation

Full docs: [pyreon.dev/docs/mcp](https://pyreon.dev/docs/mcp) (or `docs/src/content/docs/mcp.md` in this repo).

## License

MIT
