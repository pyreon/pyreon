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

## Tools

The MCP server exposes six tools that AI assistants can call.

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

---

## API Reference Coverage

The `get_api` tool has entries for all public exports across these packages:

| Package               | Coverage                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@pyreon/reactivity`  | signal, computed, effect, batch, watch, createStore, createResource, renderEffect, EffectScope                                                                     |
| `@pyreon/core`        | h, Fragment, createContext, useContext, onMount, onUnmount, onUpdate, Show, Switch, Match, For, Suspense, ErrorBoundary, lazy, Dynamic, defineComponent, createRef |
| `@pyreon/runtime-dom` | mount, hydrateRoot, Transition, TransitionGroup, KeepAlive, Portal, applyProp, applyProps                                                                          |
| `@pyreon/compiler`    | transformJSX                                                                                                                                                       |
| `@pyreon/router`      | createRouter, RouterProvider, RouterView, RouterLink, useRouter, useRoute, useSearchParams, useLoaderData                                                          |
| `@pyreon/head`        | useHead, HeadProvider                                                                                                                                              |
| `@pyreon/server`      | createHandler, prerender, island, hydrateIslands, startClient                                                                                                      |
| `@pyreon/vite-plugin` | pyreon (Vite plugin factory)                                                                                                                                       |

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
