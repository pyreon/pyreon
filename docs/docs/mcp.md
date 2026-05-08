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

Parse an error message into structured fix information.

**Parameters:**

| Param   | Type     | Description                   |
| ------- | -------- | ----------------------------- |
| `error` | `string` | The error message to diagnose |

**Response includes:**

- Root cause explanation
- Suggested fix (prose)
- Fix code snippet (when applicable)
- Related documentation links

Recognizes common Pyreon errors like missing imports, type mismatches, SSR context issues, and router configuration problems.

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

Fetches a canonical "how do I do X" pattern body from `docs/patterns/` in the monorepo. Patterns are markdown files keyed by slug (e.g. `controllable-state`, `data-fetching`, `dev-warnings`, `dynamic-fields`, `event-listeners`, `form-fields`, `imperative-toasts`, `keyed-lists`, `reactive-context`, `routing-setup`, `signal-writes`, `ssr-safe-hooks`, `state-management`, `styler-theming`).

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

Browses the anti-pattern catalog parsed live from `.claude/rules/anti-patterns.md`. Each entry surfaces the rule body plus its `[detector: <code>]` tag (when one exists), so an agent can pair the catalog entry with the live static detector run by the [`validate`](#validate) tool.

**Parameters:**

| Param      | Type      | Description                                                                                                                                                                                                          |
| ---------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `category` | `string?` | Filter to one category. Allowed: `reactivity`, `jsx`, `context`, `architecture`, `testing`, `lifecycle`, `documentation`, `all`. Omit (or pass `"all"`) for the full catalog. Returns matching suggestions on a typo. |

**Example call:**

```json
{ "category": "reactivity" }
```

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
