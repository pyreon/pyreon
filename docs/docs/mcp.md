---
title: '@pyreon/mcp'
description: Model Context Protocol server that gives AI coding assistants deep knowledge of Pyreon APIs, patterns, and project structure.
---

`@pyreon/mcp` is a [Model Context Protocol](https://modelcontextprotocol.io/) server that gives AI coding assistants (Claude Code, Cursor, Windsurf, etc.) deep knowledge of Pyreon's APIs, patterns, and your project structure. It provides tools for API lookup, code validation, React migration, error diagnosis, and project introspection.

<PackageBadge name="@pyreon/mcp" href="/docs/mcp" />

## Installation

::: code-group

```bash [npm]
npm install @pyreon/mcp
```

```bash [bun]
bun add @pyreon/mcp
```

```bash [pnpm]
pnpm add @pyreon/mcp
```

```bash [yarn]
yarn add @pyreon/mcp
```

:::

## Quick Start

### Claude Code

Add to your `.claude/settings.json`:

```json
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

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "pyreon": {
      "command": "bunx",
      "args": ["@pyreon/mcp"]
    }
  }
}
```

### Other MCP Clients

The server uses stdio transport. Any MCP-compatible client can connect by spawning:

```bash
bunx @pyreon/mcp
```

---

## Tools by intent

Pick the tool that matches what you're trying to do — call `mcp_overview` first if you want the live catalog with one-line "when to use" descriptions for every tool.

- **Discover the tool surface** — [`mcp_overview`](#mcp_overview) (start here)
- **Look up an API** — [`get_api`](#get_api)
- **Validate a snippet against React + Pyreon anti-patterns** — [`validate`](#validate)
- **Convert React code to Pyreon** — [`migrate_react`](#migrate_react)
- **Diagnose a Pyreon error** — [`diagnose`](#diagnose)
- **Explain a captured crash with its reactive run-up** — [`explain_error`](#explain_error)
- **Project introspection** — [`get_routes`](#get_routes), [`get_components`](#get_components)
- **Find a "how do I do X" pattern** — [`get_pattern`](#get_pattern)
- **Browse the anti-pattern catalog** — [`get_anti_patterns`](#get_anti_patterns)
- **Read recent release notes** — [`get_changelog`](#get_changelog)
- **Audit test environment for mock-vnode drift** — [`audit_test_environment`](#audit_test_environment)
- **Audit islands cross-file foot-guns** — [`audit_islands`](#audit_islands)
- **Check browser smoke coverage** — [`get_browser_smoke_status`](#get_browser_smoke_status)

---

## Tools

The MCP server exposes thirteen tools that AI assistants can call.

### mcp_overview

Returns a markdown table of every registered MCP tool with a one-sentence "when to use" description and a one-line example. Reads from the package's manifest at runtime — single source of truth, so adding a new tool surfaces here automatically. Intended as the **first call** for any AI agent connecting to the server: enumerates the surface so the agent can navigate by intent rather than guessing tool names from `tools/list`.

**Parameters:** None

**Example call:**

```json
{}
```

**Response shape:**

```text
**MCP Tools (13):**

| Tool | When to use | Example |
|---|---|---|
| `mcp_overview` | Returns a markdown table of every registered MCP tool... | `mcp_overview()` |
| `get_api` | Look up any Pyreon API by package and symbol... | `get_api({ package: 'flow', symbol: 'createFlow' })` |
| ... (one row per registered tool)
```

### get_api

Look up any Pyreon API symbol. Returns the signature, a usage example, notes, and common mistakes.

**Parameters:**

| Param     | Type     | Description                                                             |
| --------- | -------- | ----------------------------------------------------------------------- |
| `package` | `string` | Package name without scope (e.g., `"reactivity"`, `"core"`, `"router"`) |
| `symbol`  | `string` | Export name (e.g., `"signal"`, `"computed"`, `"createRouter"`)          |

**Example call:**

```json
{ "package": "reactivity", "symbol": "signal" }
```

**Response includes:**

- TypeScript signature
- Usage example with code
- Notes on behavior
- Common mistakes and their fixes

If the symbol is not found, the tool returns up to 5 fuzzy-matched suggestions.

### validate

Check a code snippet for Pyreon anti-patterns and React-isms.

**Parameters:**

| Param      | Type      | Description                          |
| ---------- | --------- | ------------------------------------ |
| `code`     | `string`  | The source code to validate          |
| `filename` | `string?` | Optional filename for parser context |

**Detects issues like:**

- `useState` / `useEffect` / `useMemo` usage (should be `signal` / `effect` / `computed`)
- `.value` access on signals (should call `signal()`)
- Missing `by` prop on `<For>`
- Passing raw signal as child instead of calling it

Each issue includes the line number, current code, suggested fix, and whether it's auto-fixable.

### migrate_react

Automatically convert React code to idiomatic Pyreon.

**Parameters:**

| Param      | Type      | Description                  |
| ---------- | --------- | ---------------------------- |
| `code`     | `string`  | React source code to migrate |
| `filename` | `string?` | Optional filename            |

**Transforms:**

- `useState(x)` to `signal(x)`
- `useMemo(() => x, [deps])` to `computed(() => x)`
- `useEffect(() => &#123;...&#125;, [deps])` to `effect(() => &#123;...&#125;)`
- `useCallback(fn, [deps])` to plain `fn` (no wrapper needed)
- `useRef(null)` to `createRef()`
- React imports to Pyreon imports

Returns the migrated code, a list of applied changes, and any remaining issues that need manual attention.

### diagnose

Parse a Pyreon runtime / build error into structured fix information. The **string-only call is fully backward-compatible** — pass just `error` and you get the v1 behavior (probable cause + fix + related docs from the regex pattern table). v2 adds **optional structured context** for richer, causal diagnosis: supply the failing component source and the dev-mode reactive trace and the tool assembles a deterministic failure context for the calling agent to reason over (no embedded model).

**Parameters:**

| Param             | Type                    | Description                                                                                                                                                  |
| ----------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `error`           | `string`                | The error message / stack to diagnose                                                                                                                        |
| `componentSource` | `string?`               | Failing component source. Runs the static Pyreon detectors over it and maps each hit to the documented anti-pattern catalog entry                             |
| `filename`        | `string?`               | Filename for path-sensitive detectors                                                                                                                        |
| `reactiveTrace`   | `ReactiveTraceEntry[]?` | `ErrorContext.reactiveTrace` from `@pyreon/core` (dev-only) — the causal sequence of signal writes leading to the crash, formatted as a chronological run-up  |
| `phase`           | `string?`               | Lifecycle phase (`setup` / `render` / `mount` / `unmount` / `effect`)                                                                                        |

`ReactiveTraceEntry` is `{ name?: string; prev: string; next: string; timestamp: number }`.

**Response includes:**

- Root cause explanation (v1 regex diagnosis)
- Suggested fix (prose) + fix code snippet (when applicable)
- Related documentation links
- **(v2, when `componentSource` supplied)** static detector findings mapped to matched anti-pattern catalog entries
- **(v2, when `reactiveTrace` supplied)** the chronological signal-write run-up to the crash

The enrichment sections appear **only** when the optional context is supplied — an error-only call returns byte-identical output to v1. `reactiveTrace` is dev-only (it tree-shakes out of production builds), so production error reports degrade gracefully to the v1 base diagnosis. Recognizes common Pyreon errors like missing imports, type mismatches, SSR context issues, and router configuration problems.

**Example call (v2):**

```json
{
  "error": "name is stale after parent update",
  "componentSource": "function G({ name }) { return <div>{name}</div> }",
  "reactiveTrace": [{ "name": "name", "prev": "\"a\"", "next": "\"b\"", "timestamp": 1 }]
}
```

### explain_error

The rich-context sibling of [`diagnose`](#diagnose). Where `diagnose` matches an error **string** against the known-footgun table, `explain_error` takes a full `ErrorContext`-shaped **report** — crucially the `reactiveTrace`, the causal *sequence* of signal writes from `@pyreon/core`'s error reports — and assembles a structured **failure dossier**: the reactive run-up, heuristic findings (empty-trace / nullish-then-crash / write-storm / last-write-correlation / type-flip), optional static `detectPyreonPatterns` over the component source, and correlated anti-pattern catalog entries. The server only assembles + applies cheap heuristics; the consuming agent reasons over the dossier and a human gates any patch. The tool returns **text only** — no mutation, no embedded model. Use it when a captured Pyreon crash's stack trace alone is not enough and you want to see *how* the app reached the failing state.

**Parameters:**

| Param             | Type      | Description                                                                                                                  |
| ----------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `report`          | `string`  | A JSON-stringified `ErrorContext` report (from `registerErrorHandler(ctx => …)` in dev). The `reactiveTrace` is the high-signal field |
| `componentSource` | `string?` | Failing component source — runs the static Pyreon detectors over it and correlates hits to the anti-pattern catalog          |

**Response includes:**

- The reactive run-up (chronological signal-write sequence leading to the crash)
- Heuristic findings (empty-trace / nullish-then-crash / write-storm / last-write-correlation / type-flip)
- **(when `componentSource` supplied)** static detector findings mapped to matched anti-pattern catalog entries
- A suspected cause — but **no fix is applied**; repair is human-gated by construction (the tool has no write capability)

Capture the report in **dev**: `reactiveTrace` tree-shakes out of production builds, so a production report carries `reactiveTrace: undefined` and the dossier's highest-signal section will be empty. For a quick "what does this error mean" on just a string, use [`diagnose`](#diagnose) instead.

**Example call:**

```json
{
  "report": "{\"phase\":\"render\",\"error\":\"x is not a function\",\"reactiveTrace\":[{\"name\":\"items\",\"prev\":\"[]\",\"next\":\"null\",\"timestamp\":1}]}"
}
```

### get_routes

List all routes detected in the current project.

**Parameters:** None

Scans the project directory for `createRouter` calls and route definition arrays. For each route, reports:

- Path pattern (e.g., `/user/:id`)
- Route name (if set)
- Whether it has a loader
- Whether it has a navigation guard
- Extracted path parameters

### get_components

List all components detected in the current project.

**Parameters:** None

Scans the project directory for exported component functions. For each component, reports:

- Component name and file path
- Props interface fields
- Signal declarations within the component

### get_browser_smoke_status

Companion to the `pyreon/require-browser-smoke-test` lint rule. Reports which browser-categorized Pyreon packages have at least one `*.browser.test.{ts,tsx}` file under `src/`. Reads the same `.claude/rules/browser-packages.json` single source of truth as the rule and the CI script. Lets an AI agent check coverage **before** writing a new browser package (so it adds a smoke test in the same PR) instead of discovering the failure when CI runs.

**Parameters:** None

**Response includes:**

- `Covered (N)` — packages that ship at least one browser smoke test
- `Missing` — packages categorized as browser but with no `*.browser.test.*` file
- `Listed in browser-packages.json but not found in this repo` — drift between the JSON list and the actual workspace

Falls back with a clear message when `.claude/rules/browser-packages.json` isn't present (consumer apps that don't ship the Pyreon monorepo layout).

### get_pattern

Fetches a canonical "how do I do X" pattern body from `docs/docs/patterns/` in the monorepo. Patterns are markdown files keyed by slug — 16 today: `controllable-state`, `data-fetching`, `dev-warnings`, `dynamic-fields`, `event-listeners`, `form-fields`, `imperative-toasts`, `islands`, `keyed-lists`, `reactive-context`, `reactive-spread`, `routing-setup`, `signal-writes`, `ssr-safe-hooks`, `state-management`, `styler-theming`. Drop a new `docs/docs/patterns/<slug>.md` file to add one — it's discovered at runtime on the next call, no code change needed.

**Parameters:**

| Param  | Type     | Description                                                                                |
| ------ | -------- | ------------------------------------------------------------------------------------------ |
| `name` | `string` | Pattern slug — e.g. `"controllable-state"`. Omit to receive the catalog of available slugs |

**Example call:**

```json
{ "name": "controllable-state" }
```

When a pattern isn't found, returns up to 5 fuzzy-matched suggestions plus the full catalog.

### get_anti_patterns

Browses the anti-pattern catalog parsed live from `.claude/rules/anti-patterns.md`. **Token-frugal by default**: with no arguments the tool returns a **compact index** — one line per entry (title + `[detector: <code>]` tag + a one-sentence hook), with the per-category `## <Heading>` markers preserved so categories stay discoverable in a single call. This is ≈3.3K tokens versus ≈14K for the full dump — a ~76% cut on the common "what should I avoid?" orient call. Drill into full bodies deliberately:

- `{ name }` → the single matching entry's full body (cheapest drill-in; case-insensitive title substring match)
- `{ category }` → full bodies for one category (the unchanged pre-existing filtered contract)
- `{ full: true }` → the entire catalog (~14K tokens — explicit, expensive opt-in)

Each `[detector: <code>]` tag pairs the entry with the live static detector run by the [`validate`](#validate) tool.

**Parameters:**

| Param      | Type       | Description                                                                                                                                              |
| ---------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `category` | `string?`  | Full bodies for one category. Allowed: `reactivity`, `jsx`, `context`, `architecture`, `testing`, `lifecycle`, `documentation`, `all`. Omit for the index |
| `name`     | `string?`  | Full body of the entry whose title contains this (case-insensitive). Most token-frugal drill-in. Returns the index pointer on no match                    |
| `full`     | `boolean?` | Return the entire catalog (~14K tokens). Default is the compact index                                                                                    |

**Example calls:**

```json
{}
```

```json
{ "name": "Destructuring props" }
```

```json
{ "category": "reactivity" }
```

> **Behavior note:** prior to the token-slim change, a no-arg call returned the entire catalog. It now returns the compact index. Full bodies are still fully reachable — via `{ name }`, `{ category }`, or `{ full: true }` — just behind a deliberate call instead of the default. A token-budget CI gate (`src/tests/token-budget.test.ts`) pins `get_anti_patterns({})` under 5,000 tokens and keeps the index ≥60% smaller than `{ full: true }`.

### get_changelog

Recent release notes for any `@pyreon/*` package, parsed from `packages/**/CHANGELOG.md`. Filters out ceremonial bump-only releases (pure dependency updates with no user-facing body) by default. Useful when an agent needs to know what changed since a given version without scraping `git log` or raw markdown.

**Parameters:**

| Param                      | Type       | Description                                                                                                                          |
| -------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `package`                  | `string?`  | Package name — accepts `"query"` or `"@pyreon/query"`. Omit to receive the index of all available packages with their latest version |
| `limit`                    | `number?`  | Maximum number of substantive versions to return. Default `5`                                                                        |
| `includeDependencyUpdates` | `boolean?` | Re-include the bump-only releases the tool drops by default                                                                          |
| `since`                    | `string?`  | Only include versions strictly newer than this (e.g. `"0.12.0"`). Useful when the agent knows the version it was trained against     |

**Example call:**

```json
{ "package": "flow", "limit": 5 }
```

### audit_test_environment

Scans every `*.test.{ts,tsx}` under `packages/` for the mock-vnode anti-pattern (PR #197 bug class — tests that construct `{ type, props, children }` literals or custom `vnode()` helpers instead of going through the real `h()` from `@pyreon/core`). Each file is classified `HIGH` / `MEDIUM` / `LOW` by the balance of mock literals, mock-helper definitions and call-sites vs real `h()` calls.

**Parameters:**

| Param     | Type      | Description                                                                                                |
| --------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| `minRisk` | `string?` | `"high"`, `"medium"`, or `"low"`. Default `"medium"` (HIGH + MEDIUM files). `"low"` shows everything       |
| `limit`   | `number?` | Max entries per risk group. Default `20`                                                                   |

**Example call:**

```json
{ "minRisk": "medium" }
```

The detector includes false-positive heuristics (helper-def vs binding discrimination, type-guard call-arg skip, template-string fixture mask) so genuine code doesn't drown out the real findings.

### audit_islands

Project-wide islands audit — runs five cross-file detectors that auto-registry can't reach: `duplicate-name` (two `island()` declarations sharing a name — runtime hydrates only the first), `never-with-registry-entry` (a `hydrate: 'never'` island registered in any file's manual `hydrateIslands({ ... })` call, defeating the zero-JS goal), `registry-mismatch` (a manual registry entry with no matching `island()` declaration anywhere — typo / removed island / forgotten import), `nested-island` (an `island()` whose loader-target file also contains an `island()` call — outer's `hydrateRoot` replaces the inner before its loader runs), and `dead-island` (an `island()` declaration whose file is never imported statically or dynamically — unreachable code).

**Parameters:**

| Param  | Type       | Description                                                                                                                                                                |
| ------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `json` | `boolean?` | Return raw JSON output instead of human-readable markdown. Useful when an agent wants to programmatically count findings by code or filter by location                     |

**Example call:**

```json
{}
```

Each finding ships with file path + line/column + actionable fix suggestion. Companion to `pyreon doctor --check-islands` (CLI) — same detector, two surfaces.

---

## API Reference Coverage

The `get_api` tool has entries for the public exports of every published `@pyreon/*` package — 32 packages on the manifest pipeline today. Coverage is regenerated whenever a package's `src/manifest.ts` changes via `bun run gen-docs`. Spot-check the live entry count with:

```bash
bun run gen-docs --check
```

Major coverage areas: `@pyreon/reactivity`, `@pyreon/core`, `@pyreon/runtime-dom`, `@pyreon/router`, `@pyreon/head`, `@pyreon/server`, `@pyreon/store`, `@pyreon/state-tree`, `@pyreon/form`, `@pyreon/validation`, `@pyreon/query`, `@pyreon/hooks`, `@pyreon/permissions`, `@pyreon/machine`, `@pyreon/storage`, `@pyreon/i18n`, `@pyreon/document`, `@pyreon/document-primitives`, `@pyreon/flow`, `@pyreon/charts`, `@pyreon/code`, `@pyreon/hotkeys`, `@pyreon/table`, `@pyreon/virtual`, `@pyreon/feature`, `@pyreon/lint`, `@pyreon/mcp`, `@pyreon/ui-core`, `@pyreon/unistyle`, `@pyreon/rx`, `@pyreon/toast`, `@pyreon/url-state`.

---

## How It Works

The MCP server runs as a subprocess communicating over stdio. When an AI assistant needs Pyreon-specific knowledge, it calls one of the tools above instead of guessing from training data. This ensures the assistant always has accurate, up-to-date API information regardless of its training cutoff.

The project scanning tools (`get_routes`, `get_components`) use the same TypeScript-based scanner from `@pyreon/compiler` to analyze the actual project source code. Results are cached per working directory and regenerated when the directory changes.

---

## Troubleshooting

### The server starts but no tools appear in the client

The MCP server speaks JSON-RPC over stdio. If the client connected successfully but `tools/list` returns empty, the server's tool registrations failed silently — usually a Node version mismatch (the server uses dynamic imports for some tools' lazy paths).

- Verify the client is launching the server with a Node version ≥ 18 (check the client's MCP config / runtime).
- Look for `[mcp]` stderr lines in the client's log directory (Claude Code: `~/Library/Logs/Claude/`, Cursor: settings → output panel → "MCP Logs").
- Test the server in isolation: `bunx pyreon-mcp` and send a JSON-RPC `initialize` frame manually. If `initialize` succeeds but `tools/list` is empty, file an issue with the stderr output.

### `get_pattern` / `get_anti_patterns` return "could not locate"

Both tools read files from the host Pyreon monorepo (`docs/patterns/*.md` and `.claude/rules/anti-patterns.md` respectively). When the server runs from a CONSUMER project (not the monorepo), those files aren't reachable — the tools degrade gracefully with the "could not locate" message. This is by design: the tools always check the working directory's ancestor tree, so adding the same `.claude/rules/anti-patterns.md` to a consumer project surfaces the entries.

### `audit_test_environment` / `audit_islands` report zero findings in a known-broken codebase

The audit scanners walk from `process.cwd()`. If the MCP server's working directory isn't the project root, the walk may miss your `src/`. Most MCP clients spawn the server with `cwd` set to the client's open project — verify by calling `get_components` first; if THAT returns zero, the cwd is wrong.

### `validate` always returns "✓ No issues found"

`validate` runs two AST-based detectors (`detectReactPatterns` + `detectPyreonPatterns`). If both return empty, the snippet is clean. If you expect a detection that doesn't fire:

- Confirm the snippet is syntactically valid TypeScript / TSX. The detectors silently skip parse errors.
- Check the detector's exact pattern shape (`get_anti_patterns` shows the rule body for every detector code). E.g. `props-destructured-body` only fires inside a PascalCase JSX component body, not in a free function.

### `get_changelog` returns "not found" for a known package

The package lookup walks up from cwd looking for `packages/**/CHANGELOG.md`. If you renamed a package directory but kept the npm name, the walker won't find it. The tool accepts both `query` and `@pyreon/query` — try both forms.

### The server hangs on first connection

The MCP server doesn't make any network calls or long-running scans at startup — it should return `initialize` in <50 ms. If it hangs, the client is most likely waiting for stdout buffering to flush — make sure the client's MCP transport is configured to read line-delimited JSON-RPC, not block on a chunk size.

---

## Exports Summary

| Export            | Description                                           |
| ----------------- | ----------------------------------------------------- |
| CLI entry (`bin`) | Starts the MCP server on stdio transport              |
| `API_REFERENCE`   | Structured API documentation database                 |
| `generateContext` | Project scanner (re-exported from `@pyreon/compiler`) |
| `ProjectContext`  | Type: scanned project metadata                        |
| `RouteInfo`       | Type: detected route information                      |
| `ComponentInfo`   | Type: detected component information                  |
| `IslandInfo`      | Type: detected island information                     |
