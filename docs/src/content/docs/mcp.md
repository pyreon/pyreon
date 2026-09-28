---
title: '@pyreon/mcp'
description: Model Context Protocol server that gives AI coding assistants deep knowledge of Pyreon APIs, patterns, and project structure.
---

`@pyreon/mcp` is a [Model Context Protocol](https://modelcontextprotocol.io/) server that gives AI coding assistants (Claude Code, Cursor, Windsurf, etc.) deep, accurate knowledge of Pyreon's APIs, patterns, and your project structure. Instead of guessing from a training cutoff, the assistant calls tools that read the *live* Pyreon source of truth — the manifest-generated API reference, the anti-pattern catalog, the pattern library, parsed changelogs, and structural scans of your actual project.

<PackageBadge name="@pyreon/mcp" href="/docs/mcp" />

The server runs as a subprocess over **stdio transport**, so any MCP-compatible client can connect by spawning it. It exposes **24 tools** spanning discovery, API lookup, static validation, React migration, error diagnosis, project introspection, content-collection navigation, project-wide audits, workspace / component-catalog verification (`loom` / `atlas`), and the generated API client (`lathe`). It is read-only and deterministic — every tool returns **text only**; nothing mutates your files and no LLM is embedded in the server itself.

## Installation

:::code-group

```bash [npm]
npm install -D @pyreon/mcp
```

```bash [bun]
bun add -D @pyreon/mcp
```

```bash [pnpm]
pnpm add -D @pyreon/mcp
```

```bash [yarn]
yarn add -D @pyreon/mcp
```

:::

You don't have to install it at all — most clients run it on demand via `bunx` (see below), which fetches and caches the latest published version.

## Quick Start

Register the server with your MCP-aware client. The config shape is identical across clients; only the file location differs.

### Claude Code

Add to `.mcp.json` at your project root (or `.claude/settings.json`):

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

### Windsurf

Add to `.windsurf/mcp.json` (same format):

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

### Any other MCP client

The server speaks JSON-RPC over **stdio**. Point your client at the spawn command:

```bash
bunx @pyreon/mcp
```

The published package also installs a `pyreon-mcp` bin, so `bunx pyreon-mcp` (or `npx pyreon-mcp`) is equivalent — handy when testing the server in isolation.

:::tip
The server makes no network calls and runs no long scans at startup — it returns `initialize` in `<50ms`. The project-scanning tools (`get_routes`, `get_components`) walk your source lazily on first call and cache the result.
:::

## Why an MCP server?

An AI assistant's training data has a cutoff and is averaged across many frameworks — it tends to "fall back to React" or invent plausible-but-wrong Pyreon APIs. The MCP server closes that gap by exposing Pyreon's structured knowledge as callable tools the assistant reaches for *before* writing code:

- **`get_api`** answers "what does this API do, and how do I avoid the common mistakes?" from the same manifest that generates the docs.
- **`validate`** catches "coming-from-React", "using-Pyreon-wrong", and (for snippets importing `@pyreon/primitives`) multiplatform-only mistakes statically, with line/column and an auto-fix suggestion — before the code is pasted. A finding that is genuinely correct code (the detectors have no type checker) can be silenced where it sits with `// pyreon-lint-ignore <code>` on the line above — the same comment `@pyreon/lint` uses, accepting either the bare code or the prefixed id the doctor prints.
- **`get_pattern` / `get_anti_patterns`** are proactive: fetch the canonical shape (or the foot-gun catalog) *before* writing, not after a bug ships.
- **`diagnose` / `explain_error`** turn a runtime error string (or a full dev-mode error report with the reactive trace) into structured fix context.
- The **`audit_*`** tools and **`get_routes` / `get_components` / `get_content_*`** introspect your real project so generated code references things that actually exist.

The same data feeds three surfaces — `mcp_overview()` (live), `api-reference.ts` (the `get_api` database), and this docs page — so they can't drift.

## Tools by intent

Pick the tool that matches what you're trying to do — or call [`mcp_overview`](#mcp_overview) first for the live catalog with a one-line "when to use" for every registered tool.

- **Discover the tool surface** — [`mcp_overview`](#mcp_overview) (start here)
- **Look up an API** — [`get_api`](#get_api)
- **Validate a snippet (React + Pyreon + native anti-patterns)** — [`validate`](#validate)
- **See the compiler's reactivity verdict for a snippet** — [`explain_reactivity`](#explain_reactivity)
- **Convert React code to Pyreon** — [`migrate_react`](#migrate_react)
- **Auto-fix the mechanical Pyreon footguns** — [`migrate_pyreon`](#migrate_pyreon)
- **Diagnose a Pyreon error string** — [`diagnose`](#diagnose)
- **Explain a captured crash with its reactive run-up** — [`explain_error`](#explain_error)
- **Project introspection** — [`get_routes`](#get_routes), [`get_components`](#get_components)
- **Navigate content collections** — [`get_content_collection`](#get_content_collection), [`get_content_entry`](#get_content_entry)
- **Find a "how do I do X" pattern** — [`get_pattern`](#get_pattern)
- **Browse the anti-pattern catalog** — [`get_anti_patterns`](#get_anti_patterns)
- **Read recent release notes** — [`get_changelog`](#get_changelog)
- **Audit tests for mock-vnode drift** — [`audit_test_environment`](#audit_test_environment)
- **Audit islands cross-file foot-guns** — [`audit_islands`](#audit_islands)
- **Check browser smoke coverage** — [`get_browser_smoke_status`](#get_browser_smoke_status)
- **Write against components that provably exist** — [`get_atlas_catalog`](#get_atlas_catalog), [`get_atlas_component`](#get_atlas_component)
- **Ask "what does changing this package reach?"** — [`get_dependency_fabric`](#get_dependency_fabric)
- **Call the project's generated API client correctly** — [`get_api_client`](#get_api_client), [`get_api_operation`](#get_api_operation)
- **Ask "what does this spec change break?"** — [`explain_api_diff`](#explain_api_diff)

---

## Tools reference

The server registers **24 tools**. The table below is the complete surface — every tool, its parameters, and what it returns; it is hand-maintained (this page isn't code-generated), but `scripts/check-mcp-docs.ts` (CI-gated) cross-checks the THREE surfaces that must agree — the `server.tool(...)` registrations in `src/index.ts`, the tool entries in `src/manifest.ts` (which drive `mcp_overview()` and the entry count below), and this page's `### <name>` sections — and fails the build if any tool is missing from any of them.

| Tool | Parameters | Returns |
| ---- | ---------- | ------- |
| [`mcp_overview`](#mcp_overview) | *(none)* | Markdown table of every tool with a "when to use" + one-line example |
| [`get_api`](#get_api) | `package: string`, `symbol: string` | Signature + usage example + notes + common mistakes for one API |
| [`validate`](#validate) | `code: string`, `filename?: string` | Merged React + Pyreon + native anti-pattern diagnostics (line/col, fix, fixable flag) |
| [`explain_reactivity`](#explain_reactivity) | `code: string`, `filename?: string` | The compiler's per-expression reactivity verdict (live / baked-static / footgun) over an annotated source view |
| [`migrate_react`](#migrate_react) | `code: string`, `filename?: string` | Rewritten Pyreon code + applied-changes list + remaining manual issues |
| [`migrate_pyreon`](#migrate_pyreon) | `code: string`, `filename?: string` | Auto-fixes the mechanically-safe Pyreon footguns; returns the rest for manual fix |
| [`diagnose`](#diagnose) | `error: string`, `componentSource?: string`, `filename?: string`, `reactiveTrace?: ReactiveTraceEntry[]`, `phase?: string` | Probable cause + fix + related docs; optional detector + reactive-trace enrichment |
| [`explain_error`](#explain_error) | `report: string`, `componentSource?: string` | A structured failure dossier from a full `ErrorContext` report |
| [`get_routes`](#get_routes) | *(none)* | Every route in the current project — path, loader, guard, params, name |
| [`get_components`](#get_components) | *(none)* | Every component — name, file, props, signal usage |
| [`get_content_collection`](#get_content_collection) | `name?: string` | List of `@pyreon/zero-content` collections, or one collection's entries |
| [`get_content_entry`](#get_content_entry) | `collection: string`, `slug: string` | One content entry's frontmatter, heading outline, path, byte size |
| [`get_browser_smoke_status`](#get_browser_smoke_status) | *(none)* | Which browser-categorized packages have a `*.browser.test.*` file |
| [`get_pattern`](#get_pattern) | `name?: string` | A canonical "how do I do X" pattern body (or the catalog of slugs) |
| [`get_anti_patterns`](#get_anti_patterns) | `category?: enum`, `name?: string`, `full?: boolean`, `page?: number` | The anti-pattern catalog — compact index by default, drill-in on demand |
| [`get_changelog`](#get_changelog) | `package?: string`, `limit?: number`, `includeDependencyUpdates?: boolean`, `since?: string` | Recent release notes for a `@pyreon/*` package, ceremonial bumps filtered |
| [`audit_test_environment`](#audit_test_environment) | `minRisk?: enum`, `limit?: number` | Mock-vnode test scanner, files ranked HIGH / MEDIUM / LOW |
| [`audit_islands`](#audit_islands) | `json?: boolean` | Project-wide islands audit — five cross-file foot-gun detectors |
| [`get_dependency_fabric`](#get_dependency_fabric) | `package?: string` | The `loom scan` workspace graph — shape, cycles, gating findings, blast-radius ranking (or one package's slice of it) |
| [`get_atlas_catalog`](#get_atlas_catalog) | `tag?: string` | The `atlas scan` verified component catalog — every component's real props + scenario verification counts |
| [`get_atlas_component`](#get_atlas_component) | `name: string` | One catalogued component's exact prop values, which props are reactive, and a verified-or-labelled-unverified example |
| [`get_api_client`](#get_api_client) | `search?: string`, `path?: string` | The `lathe generate` client — every operation with its generated symbols, grouped by module, plus every model |
| [`get_api_operation`](#get_api_operation) | `operation: string`, `path?: string` | One operation's typed signature (parameter locations, body, response, stream), the models it names, and example calls |
| [`explain_api_diff`](#explain_api_diff) | `before: string`, `after?: string` | The client-contract diff between two specs / surfaces / git revisions — breaking first, with the symbols each change reaches and what to check |

`ReactiveTraceEntry` is `{ name?: string; prev: string; next: string; timestamp: number }`.

---

### mcp_overview

Returns a markdown table of every registered MCP tool with a one-sentence "when to use" description and a one-line example. It reads from the package's own manifest at runtime — the single source of truth that also drives `api-reference.ts` and this docs page — so a newly-added tool surfaces here automatically with no second wiring step.

This is the intended **first call** for any agent connecting to the server: it enumerates the surface so the agent can navigate by *intent* ("I need release notes" → `get_changelog`) rather than guessing tool names from `tools/list`.

**Parameters:** None

**Example call:**

```json
{}
```

**Response shape** (captured from a real call against this repo — every row comes straight from `manifest.ts`, so a new tool appears here the moment it's added there):

```text
**MCP Tools (24):**

| Tool | When to use | Example |
|---|---|---|
| `mcp_overview` | Returns a markdown table of every registered MCP tool with a one-sentence "when to use" description and a one-line example. | `mcp_overview()` |
| `get_browser_smoke_status` | Companion to the `pyreon/require-browser-smoke-test` lint rule. | `// Ask the MCP server:` |
| `get_api` | Look up any Pyreon API by `package` (e.g. | `// Agent-side` |
| `validate` | Two AST-based detectors run in parallel: `detectReactPatterns` flags "coming from React" mistakes … | `validate({ code: ... })` |
| `explain_reactivity` | The compiler's per-expression reactivity VERDICT for a snippet. | `explain_reactivity({ code: ... })` |
| `migrate_react` | Convert React code to idiomatic Pyreon. | `migrate_react({ code: ... })` |
| `migrate_pyreon` | The Pyreon → correct-Pyreon codemod (parallel to `migrate_react`). | `migrate_pyreon({ code: ... })` |
| `diagnose` | Parse a Pyreon runtime / build error into structured fix information. | `// v1 — unchanged, backward-compatible` |
| `explain_error` | The rich-context sibling of `diagnose`. | `explain_error({ report: JSON.stringify(errorContext) })` |
| `get_routes` | List every route in the current project — path, loader presence, guards, params, and named-route name. | `get_routes()` |
| `get_components` | List every component in the current project with its props and signal usage. | `get_components()` |
| `get_content_collection` | List the `@pyreon/zero-content` collections declared in the project's `content.config.{ts,mts,js,mjs}` … | `get_content_collection()` |
| `get_content_entry` | Fetch one content entry: its path, title and size, the parsed frontmatter, and the heading outline. | `get_content_entry({ collection: 'docs', slug: 'getting-started' })` |
| `get_atlas_catalog` | Serve the VERIFIED component catalog `atlas scan` writes — every component's real props, allowed values and scenario counts. | `get_atlas_catalog({})` |
| `get_dependency_fabric` | Serve the workspace dependency graph `loom scan` writes: shape, cycles, gating findings, blast-radius ranking. | `get_dependency_fabric({})` |
| `get_atlas_component` | Prescriptive usage for ONE catalogued component: exact allowed values, reactive props, a verified example. | `get_atlas_component({ name: 'Button' })` |
| `get_api_client` | Serve the generated API client `lathe generate` wrote — every operation with its method, path, summary and the exact symbols it exports (endpoint, `use<Op>` hook, `<op>Stream` / `use<Op>Stream` for streaming operations), grouped by the module they live in, plus every model. | `get_api_client({})` |
| `get_api_operation` | One generated operation's TYPED signature: each parameter with its location (path/query) and whether it is required, the request body, the response and stream event types, the fields of every model they name, and example calls shaped by those types — the direct endpoint call, the query or mutation hook, and a `for await` over the stream when there is one. | `get_api_operation({ operation: 'getOrder' })` |
| `explain_api_diff` | The client-contract diff between two versions of an API — each side a spec (JSON/YAML), an `api-surface.json`, or `<git-rev>:<path>` (`main:openapi.yaml`); `after` defaults to the generated client in the project. | `explain_api_diff({ before: 'main:openapi.yaml', after: 'openapi.yaml' })` |
| `get_pattern` | Fetch a canonical "how do I do X" pattern body from `docs/src/content/docs/patterns/`. | `get_pattern({ name: 'controllable-state' })` |
| `get_anti_patterns` | Browse the anti-patterns catalog from `.agents/rules/anti-patterns.md`, token-frugal by default. | `get_anti_patterns()` |
| `get_changelog` | Recent release notes for any `@pyreon/*` package without scraping `git log`. | `get_changelog({ package: 'flow', limit: 5 })` |
| `audit_test_environment` | Scan every `*.test.{ts,tsx}` under `packages/` for the mock-vnode anti-pattern that caused PR #197's silent metadata drop. | `audit_test_environment({ minRisk: 'medium', limit: 10 })` |
| `audit_islands` | Project-wide cross-file islands audit (PR C of the islands DX roadmap). | `audit_islands({})` |
```

The order above is the manifest's own order (not alphabetical, not the docs-page order) — the `mcp_overview` tool doesn't re-sort. Rows shown above with `...` have their real multi-line `example` collapsed to its first line for this page; that part is unchanged from the tool's real output. The "When to use" column is genuinely the manifest's **first sentence** (split on `.`/`!`/`?` + whitespace) — which is why `get_api`'s row above cuts off at `"(e.g."`: the period in "e.g." reads as a sentence boundary. It's a real, verbatim quirk of the current implementation, not a doc simplification — call `get_api({ package, symbol })` itself, or read the full `summary` via [`get_api({ package: 'mcp', symbol: 'get_api' })`](#get_api), when the truncated hint isn't enough.

:::warning{title="Prefer mcp_overview over tools/list"}
`tools/list` returns names + parameter schemas but no "when to use" guidance, so an agent has to call several tools to figure out which one fits the task. `mcp_overview` gives you the intent map in one call.
:::

---

### get_api

Look up any Pyreon API by `package` and `symbol`. Returns the canonical TypeScript signature, a usage example, behavior notes, and the foot-gun catalog — all drawn from `api-reference.ts`, which is regenerated from each package's `manifest.ts`. This is the single agent-facing entry point for "what does this API do, and how do I avoid the common mistakes?"

**Parameters:**

| Param     | Type     | Description                                                                       |
| --------- | -------- | --------------------------------------------------------------------------------- |
| `package` | `string` | Package name — accepts the short form (`"flow"`) or the scoped form (`"@pyreon/flow"`) |
| `symbol`  | `string` | Top-level export name (e.g. `"createFlow"`, `"signal"`, `"useTypedSearchParams"`) |

**Example calls:**

```json
{ "package": "flow", "symbol": "createFlow" }
```

```json
{ "package": "@pyreon/router", "symbol": "useTypedSearchParams" }
```

**Response includes:** the TypeScript signature, a usage example, behavior notes, and a common-mistakes list. If the symbol isn't found, the tool returns up to 5 fuzzy-matched suggestions.

:::warning{title="Common mistakes"}
- Passing a wrong scope or typo — `get_api({ package: "pyreon-flow" })` returns nothing. Use `"flow"` or `"@pyreon/flow"`; both work.
- `symbol` matches **top-level exports only**. A method on a returned instance (e.g. `Posts.useList`) isn't a top-level export — it's documented in the parent symbol's summary / example.
- A 404 doesn't mean the API doesn't exist — its package's manifest may not be on the pipeline yet. Fall back to the docs page or source.
- Read the full `summary` before falling back to `get_pattern` / `validate` / source diving — it often answers the follow-up question.
:::

---

### validate

Check a code snippet for anti-patterns. **Three AST-based detectors** run in parallel and their findings are merged + sorted by line / column for top-down reading:

- **`detectReactPatterns`** — "coming from React" mistakes: `useState`, `useEffect`, `useMemo`, `className`, `htmlFor`, `onChange` on inputs, `.value` writes on signals, React-package imports.
- **`detectPyreonPatterns`** — "using Pyreon wrong" mistakes: `<For>` missing `by`, props destructured at the component signature, `typeof process` dev gates, raw `addEventListener`, `Date.now() + Math.random()` IDs.
- **`detectNativePatterns`** — multiplatform (PMTC) hazards that compile for web but silently break the native build: web-only imports and dropped top-level `interface` / `enum` / `class` declarations. This detector **only fires when the snippet imports `@pyreon/primitives`**, so a pure-web snippet never false-positives on it.

**Parameters:**

| Param      | Type      | Description                                                            |
| ---------- | --------- | --------------------------------------------------------------------- |
| `code`     | `string`  | The source code to validate (a complete file — see warning below)     |
| `filename` | `string?` | Filename for parser context + path-sensitive detectors. Defaults to `snippet.tsx` |

Each diagnostic carries: the rule **code**, the **message**, **line** + **column**, the **current** offending text, the **suggested** fix, and whether it's **auto-fixable**. When all three detectors return empty, the tool replies `✓ No issues found. The code follows Pyreon patterns correctly.`

**Example call:**

```json
{
  "code": "function MyComp(props) {\n  const { value } = props\n  return <For each={items}>{i => <li>{i}</li>}</For>\n}"
}
```

```text
Found 2 issues:

1. **props-destructured** (line 2)
   Destructuring props loses reactivity...
   ...
2. **for-missing-by** (line 3)
   <For> without a `by` prop defeats keyed reconciliation...
   ...
```

:::warning{title="Common mistakes"}
- **Zero diagnostics ≠ correct code.** `validate` is a *static* detector — it catches the documented anti-patterns from the catalog, not runtime semantics, cross-file consistency, type errors, or compiler output. Pair it with `tsc` + tests.
- **Pass a complete file**, not a partial expression. The detectors expect every `import` and `function` to be present; a fragment yields no diagnostics, which reads as "clean".
- **Supply `filename`** for path-sensitive detectors (e.g. the SSR/server-only exemption logic). Without it, a diagnostic may misfire or fail to fire.
- It's a **pre-commit / before-paste** tool — running it after the code is merged is fine, but the max value is catching the bug before it ships.
:::

---

### explain_reactivity

The compiler's **per-expression reactivity verdict** for a snippet. The Pyreon compiler already decides, while emitting codegen, whether each JSX expression is reactive or baked static — `explain_reactivity` surfaces that ground truth (via `analyzeReactivity`) instead of discarding it. Where [`validate`](#validate) reports *bugs*, this reports the whole *map*: every expression classified, so an agent sees a binding that silently won't update **before** it ships the stale-closure / destructured-props / static-when-meant-reactive bug.

Each JSX expression is tagged:

- **`◆ live`** — re-renders when its signals change (reactive text).
- **`◆ live prop` / `◆ live attr`** — a reactive component prop / DOM attribute.
- **`○ baked once`** — rendered once, never updates (no signal read). Often correct (literal text), a bug only when it was *meant* to update.
- **`○ hoisted static`** — hoisted to module scope as a constant.
- **`⚠ footgun`** — a detected anti-pattern (carries the `detectPyreonPatterns` code + fix).

**Parameters:**

| Param      | Type      | Description                                                          |
| ---------- | --------- | ------------------------------------------------------------------- |
| `code`     | `string`  | The component source to analyze (a complete file with JSX bindings) |
| `filename` | `string?` | Parse-mode hint (`tsx` vs `jsx`). Defaults to `snippet.tsx`         |

**Example call:**

```json
{
  "code": "function Cart(props) {\n  const { qty } = props\n  const price = signal(9.99)\n  return <div>{qty} × {price()}</div>\n}"
}
```

```text
Reactivity map for snippet.tsx — 1 live · 1 baked-static · 1 footgun

   2 |   const { qty } = props
             ^ ⚠ footgun [props-destructured-body] — Destructuring `props` … dead snapshots …
   4 |   return <div>{qty} × {price()}</div>
                     ^ ○ baked once — never re-renders (no signal read here)
                             ^ ◆ live — re-renders whenever its signals change

⚠ 1 footgun:
  • props-destructured-body (line 2): …

Note: 1 expression is baked STATIC. If any was meant to update reactively, read a
signal by CALLING it (`count()`), read `props.x` directly instead of destructuring …
```

The `{qty}` read — from the destructured `props` — is flagged **baked once** right at the source: the agent sees the dead binding without running anything.

:::warning{title="Common mistakes"}
- **It's not `validate`.** `validate` lists anti-patterns; `explain_reactivity` classifies *every* expression, so you catch a binding that silently won't update even when no footgun fires.
- **Pass a complete component**, not a fragment — the compiler needs full JSX to classify bindings; a partial expression yields "No reactive expressions detected".
- **`baked once` is not always an error.** Static is correct for literal / one-time content; it's a bug only when that expression was *meant* to update. The tool flags the shape; you decide intent.
:::

---

### migrate_react

Convert React code to idiomatic Pyreon in one pass. Reports per-edit changes so you can apply or review, plus any remaining issues that need a manual fix.

**Transforms applied:**

| From (React) | To (Pyreon) |
| ------------ | ----------- |
| `useState(x)` | `signal(x)` (read `count()`, write `count.set(x)`) |
| `useEffect(() => fn, [deps])` | `effect(() => fn)` (deps auto-tracked) |
| `useEffect(() => fn, [])` | `onMount(() => fn)` (run-once) |
| `useMemo(() => x, [deps])` | `computed(() => x)` |
| `useCallback(fn, [deps])` | plain `fn` (no wrapper — components run once) |
| `useRef(null)` | `createRef()` from `@pyreon/core` |
| `useRef(value)` | `signal(value)` |
| `className` | `class` |
| `htmlFor` | `for` |
| `onChange` (on inputs) | `onInput` |
| React imports | Pyreon imports |

**Parameters:**

| Param      | Type      | Description                              |
| ---------- | --------- | ---------------------------------------- |
| `code`     | `string`  | React source code to migrate             |
| `filename` | `string?` | Optional filename. Defaults to `component.tsx` |

**Example call:**

```json
{
  "code": "import { useState } from 'react'\nfunction Counter() {\n  const [count, setCount] = useState(0)\n  return <button onClick={() => setCount(count + 1)}>{count}</button>\n}"
}
```

:::warning{title="Common mistakes"}
- **It doesn't cover every React feature.** Class components, Concurrent React APIs, Suspense boundaries, and React-specific libs (react-router, redux) are *not* auto-rewritten — the result flags remaining issues but won't migrate them.
- **`useEffect(fn, [deps])` → `effect(fn)` drops the deps array.** Pyreon effects auto-track via signal *reads* — verify your effect reads the same signals the React deps array listed.
- **The output is correct but mechanical.** Pair with `get_pattern` afterward to apply Pyreon-native shapes (`<Show when={() => …}>` over ternaries, `<For>` over `.map()`).
- **Idempotent** against already-migrated code — re-running it on a mostly-Pyreon file costs only the parse pass.
:::

---

### migrate_pyreon

The Pyreon → correct-Pyreon codemod — the parallel to [`migrate_react`](#migrate_react). Where `validate` / `explain_reactivity` *report* footguns, `migrate_pyreon` *fixes* the mechanically-safe ones and returns the rest for a human. This is what makes those three `detectPyreonPatterns` codes report `fixable: true`.

**Auto-fixed** (conservative — span-based, idempotent, never mangles surrounding code):

| Footgun | Fix |
| ------- | --- |
| `signal-write-as-call` | `sig(v)` → `sig.set(v)` |
| `for-with-key` | `<For key={k}>` → `<For by={k}>` |
| `as-unknown-as-vnodechild` | `x as unknown as VNodeChild` → `x` |

Every **other** detected footgun (`props-destructured`, `on-click-undefined`, `raw-add-event-listener`, `date-math-random-id`, …) needs human judgement and comes back in a **Remaining** list, untouched.

**Parameters:**

| Param      | Type      | Description                                                    |
| ---------- | --------- | ------------------------------------------------------------- |
| `code`     | `string`  | The component source to fix                                   |
| `filename` | `string?` | Parse-mode hint (`.tsx` → JSX). Defaults to `component.tsx`   |

**Example call:**

```json
{
  "code": "const count = signal(0)\ncount(1)\nconst list = <For each={a} key={k}>{i => <li />}</For>"
}
```

```text
## Migrated Code

const count = signal(0)
count.set(1)
const list = <For each={a} by={k}>{i => <li />}</For>

**Auto-fixes applied (2):**
- Line 2: `count(…)` → `count.set(…)` (signal-write-as-call)
- Line 3: `<For key={…}>` → `<For by={…}>` (for-with-key)
```

:::warning{title="Common mistakes"}
- **It doesn't fix everything `validate` flags** — only the three mechanically-safe codes. The rest need human judgement and come back in `remaining`.
- **It's not a formatter** — only the flagged spans are rewritten; run your formatter separately.
- **Re-run `validate` afterwards** to confirm the human `remaining` issues are addressed.
:::

---

### diagnose

Parse a Pyreon runtime / build error into structured fix information. The **string-only call is fully backward-compatible** — pass just `error` and you get the v1 behavior (probable cause + fix + related docs from the regex pattern table).

**v2 adds optional structured context** for richer, causal diagnosis: pass `componentSource` and the tool runs the static Pyreon detectors over it, mapping each hit to its documented anti-pattern catalog entry; pass `reactiveTrace` (the dev-only `ErrorContext.reactiveTrace` from `@pyreon/core`) and the tool formats the causal sequence of signal writes leading to the crash. The tool is **deterministic** — it assembles structured context; the calling agent reasons over it (no embedded model).

**Parameters:**

| Param             | Type                    | Description                                                                            |
| ----------------- | ----------------------- | -------------------------------------------------------------------------------------- |
| `error`           | `string`                | The error message / stack to diagnose                                                  |
| `componentSource` | `string?`               | Failing component source — runs the static Pyreon detectors and maps hits to the catalog |
| `filename`        | `string?`               | Filename for path-sensitive detectors                                                  |
| `reactiveTrace`   | `ReactiveTraceEntry[]?` | `ErrorContext.reactiveTrace` (dev-only) — the causal signal-write run-up to the crash  |
| `phase`           | `string?`               | Lifecycle phase (`setup` / `render` / `mount` / `unmount` / `effect`)                  |

**Response includes:** the root-cause explanation (v1 regex diagnosis), a suggested fix (prose + snippet when applicable), related docs, and — when the optional context is supplied — static detector findings mapped to anti-pattern entries plus the chronological reactive run-up. The enrichment sections appear **only** when the context is present; an error-only call returns byte-identical output to v1.

**Example call (v1, string-only):**

```json
{ "error": "Cannot redefine property X on object [object Object]" }
```

**Example call (v2, with structured context):**

```json
{
  "error": "name is stale after parent update",
  "componentSource": "function G({ name }) { return <div>{name}</div> }",
  "reactiveTrace": [{ "name": "name", "prev": "\"a\"", "next": "\"b\"", "timestamp": 1 }]
}
```

:::warning{title="Common mistakes"}
- **v2 didn't change the string-only behavior** — an error-only call is byte-identical to before. Enrichment appears only with `componentSource` / `reactiveTrace`.
- **It returns structured context, not a patch.** The agent reasons over it; the tool embeds no model.
- **`reactiveTrace` is dev-only** (it tree-shakes out of prod), so a production error report carries `reactiveTrace: undefined` and the tool degrades to the v1 base diagnosis.
:::

---

### explain_error

The rich-context sibling of [`diagnose`](#diagnose). Where `diagnose` matches an error *string* against the known-footgun table, `explain_error` takes a full `ErrorContext`-shaped **report** — crucially the `reactiveTrace`, the causal *sequence* of signal writes from `@pyreon/core`'s error reports — and assembles a structured **failure dossier**:

- the **reactive run-up** (chronological signal-write sequence leading to the crash),
- **heuristic findings** (empty-trace / nullish-then-crash / write-storm / last-write-correlation / type-flip),
- optional static `detectPyreonPatterns` over the component source, and
- correlated anti-pattern catalog entries.

The server only assembles + applies cheap heuristics; the consuming agent reasons over the dossier and a human gates any patch. The tool returns **text only** — no mutation, no embedded model. Use it when a captured crash's stack trace alone isn't enough and you want to see *how* the app reached the failing state.

**Parameters:**

| Param             | Type      | Description                                                                                              |
| ----------------- | --------- | ------------------------------------------------------------------------------------------------------- |
| `report`          | `string`  | A JSON-stringified `ErrorContext` report (from `registerErrorHandler(ctx => …)` in dev). The `reactiveTrace` is the high-signal field |
| `componentSource` | `string?` | Failing component source — enables static anti-pattern detection correlated to the catalog               |

The minimal `report` shape is `{ "error": "msg" | { message, name, stack }, "phase"?, "component"?, "props"?, "reactiveTrace"?: [{ name, prev, next, timestamp }] }`. If the JSON can't be parsed, the tool returns a clear template showing the expected shape.

**Example call:**

```json
{
  "report": "{\"phase\":\"render\",\"error\":\"x is not a function\",\"reactiveTrace\":[{\"name\":\"items\",\"prev\":\"[]\",\"next\":\"null\",\"timestamp\":1}]}"
}
```

:::warning{title="Common mistakes"}
- **Passing only an error string** is what `diagnose` is for. `explain_error` wants the structured report (phase, component, props, `reactiveTrace`) to be worth more.
- **It applies no fix** — it returns a dossier + suspected cause. Repair is human-gated by construction; the tool has no write capability.
- **Capture in dev.** `reactiveTrace` tree-shakes out of production, so a prod report's highest-signal section will be empty.
:::

---

### get_routes

List every route detected in the current project — walking the source from `process.cwd()` down. The result is cached per server instance and auto-invalidates when `process.cwd()` changes.

**Parameters:** None

**Reports per route:** path pattern (e.g. `/user/:id`), route name (if set), whether it has a `loader`, whether it has a navigation `guard`, and the extracted path parameters.

**Example call:**

```json
{}
```

**Response** (captured from a real call against `examples/hn-clone`, an fs-router `@pyreon/zero` app):

```text
**Routes (15):**

  /
  /ask
  /bookmarks
  /item/:id (params: id)
  /jobs
  /leaderboard
  /new
  /prefs
  /search
  /shortcuts
  /show
  /stats
  /submit
  /todos
  /user/:id (params: id)
```

:::warning{title="Common mistakes"}
- **Run it from the project root.** Outside a Pyreon project (no reachable `@pyreon/router` / `@pyreon/zero`), it returns empty.
- **The scan caches per server instance + cwd** — it won't pick up file changes mid-session. Restart the server or change cwd to refresh.
- **`hasLoader: false` ≠ "no data"** — a route can load data via `useQuery` in the component body. The flag reflects the `export const loader = …` convention only.
:::

---

### get_components

List every component in the current project with its props and signal usage. Same scanner (and same caching) as `get_routes`. Useful before generating code that needs to reference existing components.

**Parameters:** None

**Reports per component:** name + file path, props (extracted from the first parameter type / destructure), and the signals declared inside the component body.

**Example call:**

```json
{}
```

**Response** (same `hn-clone` project, first few of 29 components — real output, not fabricated):

```text
**Components (29):**

  CommentTree — src/components/CommentTree.tsx
  FeedPage — src/components/FeedPage.tsx
  StoryRow — src/components/StoryRow.tsx
  VirtualizedComments — src/components/VirtualizedComments.tsx
    signals: [parentRef]
  ErrorPage — src/routes/_error.tsx
  ...
  LeaderboardPage — src/routes/leaderboard.tsx
    signals: [sorting]
  ...
```

:::warning{title="Common mistakes"}
- **The props list may be incomplete** — components using prop spread (`<Comp {...rest}>`) or computed prop shapes won't have their forwarded keys listed.
- **`signals` lists signals declared *inside* the body** — signals imported from another module and used here are not (the scanner is per-file).
- **Run it from the project root** — same caveat as `get_routes`.
:::

---

### get_content_collection

Enumerate `@pyreon/zero-content` collections in the current project, or fetch one by name. The tool reads each declared collection's content directory, derives slugs the same way the runtime does (strip extension + trailing `/index`), and reports the title from every entry's frontmatter — so an agent can answer "what pages exist in the docs collection?" without scraping `import.meta.glob` patterns.

**Parameters:**

| Param  | Type      | Description                                              |
| ------ | --------- | ------------------------------------------------------- |
| `name` | `string?` | Collection name (e.g. `"docs"`). Omit to list every collection |

**Response shape:**

- **Without `name`** — `# Content collections (N)` followed by one bullet per collection with its type, entry count, and content dir.
- **With `name`** — a `# Collection: <name> (<type>)` header, config / content-dir / entry-count metadata, and a slug + title + path bullet per entry.

Falls back with a clear message when no `content.config.{ts,mts,js,mjs}` exists in the project, and lists the known collections when the requested `name` isn't found.

**Example calls + real response** (captured against this repo's own `docs/` package — a `@pyreon/zero-content` app):

```json
{}
```

```text
# Content collections (1)

- `docs` (pages) — 210 entries at `src/content/docs`
```

```json
{ "name": "docs" }
```

```text
# Collection: `docs` (pages)

- **Config**: `content.config.ts`
- **Content dir**: `src/content/docs`
- **Entries**: 210

## Entries

- `(index)` — Pyreon (`src/content/docs/index.md`)
- `a11y` — Accessibility primitives (a11y) (`src/content/docs/a11y.md`)
- `accessibility` — Accessibility (`src/content/docs/accessibility.md`)
...
```

---

### get_content_entry

Fetch a single entry from a `@pyreon/zero-content` collection. Returns the entry's frontmatter (parsed key→value), the full heading outline (with levels), the source size in bytes, and the file's relative path. Pairs with [`get_content_collection`](#get_content_collection) to let an agent navigate the docs corpus structurally — discover collections, list entries, drill into one.

**Parameters:**

| Param        | Type     | Description                                       |
| ------------ | -------- | ------------------------------------------------- |
| `collection` | `string` | Collection name (e.g. `"docs"`)                   |
| `slug`       | `string` | Entry slug (e.g. `"getting-started"`). Use `""` for the index |

**Response includes:** path + title + bytes, the frontmatter as a `key: value` list, and the heading outline as a depth-indented bullet list (code-fence-aware — it skips `## heading`-shaped lines inside fenced code blocks). Returns nearest-match slug suggestions when the entry isn't found within an existing collection.

**Example call — fetching THIS page's own entry** (a real, reflexive worked example: `docs/src/content/docs/mcp.md` is itself a `docs` collection entry):

```json
{ "collection": "docs", "slug": "mcp" }
```

```text
# `docs/mcp`

- **Path**: `src/content/docs/mcp.md`
- **Title**: @pyreon/mcp
- **Bytes**: <this page's current byte count — necessarily stale the moment this page is next edited; that's expected, it's a real file-size read, not a pinned constant>

## Frontmatter

- **title**: @pyreon/mcp
- **description**: Model Context Protocol server that gives AI coding
  assistants deep knowledge of Pyreon APIs, patterns, and project structure.

## Heading outline

  - Installation
  - Quick Start
    - Claude Code
    - Cursor
    ...
  - Tools reference
    - mcp_overview
    - get_api
    ...
```

---

### get_browser_smoke_status

Companion to the `pyreon/require-browser-smoke-test` lint rule. Reports which browser-categorized Pyreon packages have at least one `*.browser.test.{ts,tsx}` file under `src/`, reading the same `.agents/rules/browser-packages.json` single source of truth as the rule and the CI script. An agent can check coverage **before** writing a new browser package — so it adds the smoke test in the same PR instead of discovering the gap when CI runs.

**Parameters:** None

**Response includes:**

- `Covered (N)` — packages that ship at least one browser smoke test.
- `Missing` — packages categorized as browser but with no `*.browser.test.*` file (plus a pointer to the setup recipe in `.agents/rules/test-environment-parity.md`).
- `Listed in browser-packages.json but not found in this repo` — drift between the JSON list and the actual workspace.

Falls back with a clear message when `.agents/rules/browser-packages.json` isn't present (consumer apps that don't ship the Pyreon monorepo layout).

**Example call + real response** (this repo currently has full coverage — every browser-categorized package ships a smoke test):

```json
{}
```

```text
**Browser smoke coverage** (34 / 34):

✓ Covered (34):
  - @pyreon/runtime-dom
  - @pyreon/router
  - @pyreon/head
  - @pyreon/server
  - @pyreon/flow
  ...
  - @pyreon/zero-content
```

:::warning{title="Common mistakes"}
This tool only checks **file existence**, not the self-expiring-exemption logic that `bun run lint:browser-smoke` performs. Don't use its output as a substitute for running the CI script.
:::

---

### get_pattern

Fetch a canonical "how do I do X" pattern body from `docs/src/content/docs/patterns/` — the exact same markdown files the docs website renders, so the assistant and the human read identical text. The patterns are markdown files keyed by slug — **17 ship today**:

`controllable-state`, `data-fetching`, `dev-warnings`, `dynamic-fields`, `event-listeners`, `form-fields`, `imperative-toasts`, `islands`, `keyed-lists`, `multiplatform`, `reactive-context`, `reactive-spread`, `routing-setup`, `signal-writes`, `ssr-safe-hooks`, `state-management`, `styler-theming`.

Drop a new `docs/src/content/docs/patterns/<slug>.md` file to add one — it's discovered at runtime on the next call in a monorepo checkout, no code change needed. (The published `bunx @pyreon/mcp` case reads a bundled snapshot instead — see [Troubleshooting](#troubleshooting) below.) Omit `name` to receive the catalog of available slugs.

**Parameters:**

| Param  | Type      | Description                                                                       |
| ------ | --------- | --------------------------------------------------------------------------------- |
| `name` | `string?` | Pattern slug — e.g. `"controllable-state"`. Omit to list the available slugs       |

**Example call:**

```json
{ "name": "controllable-state" }
```

When a pattern isn't found, the tool returns up to 5 fuzzy-matched suggestions plus a pointer to the no-arg catalog list.

:::warning{title="Common mistakes"}
- **Pattern slugs are kebab-case** — `controllable-state`, not `ControllableState`. A wrong-case name 404s.
- **It covers the 17 foundational shapes.** Specialized topics (PMTC internals, native compat shims, devtools wiring) live in the wider docs site, not as a `get_pattern` slug.
- **Patterns ≠ anti-patterns.** `get_pattern` returns "how to do X correctly"; `get_anti_patterns` returns "what to avoid". They're complementary.
:::

---

### get_anti_patterns

The compact index clamps a title longer than 120 characters on a word boundary and marks it with `…`; pass any fragment of a title as `name` (a copied `…` is stripped) to get the full entry.

Browse the anti-pattern catalog parsed live from `.agents/rules/anti-patterns.md`. **Token-frugal by default**: with no arguments the tool returns a **compact index** — one line per entry (title + `[detector: <code>]` tag + a one-sentence hook), with the per-category `## <Heading>` markers preserved so categories stay discoverable. The index is at least ~60% smaller than `{ full: true }` (measured on this repo's 413-entry catalog: ~8.7K index tokens vs ~68.6K for the full dump — a ~87% cut; the catalog only grows, so treat these two figures as illustrative, not a pinned contract — the ≥60% *ratio* is what `token-budget.test.ts` actually gates). Drill into full bodies deliberately:

- `{ name }` → the single matching entry's full body (cheapest drill-in; case-insensitive title substring match).
- `{ category }` → full bodies for one category (the pre-existing filtered contract).
- `{ full: true }` → the entire catalog (tens of thousands of tokens — explicit, expensive opt-in).
- `{ page }` → the next slice of the index. The index is PAGINATED at 240 entries, because its size follows the entry count rather than any entry's density — and pagination is no longer hypothetical: this repo's catalog is already past that threshold, so a real no-arg call today returns `page 1 of 2`; the footer names the next page.

Each `[detector: <code>]` tag pairs the entry with the live static detector run by the [`validate`](#validate) tool.

**Parameters:**

| Param      | Type       | Description                                                                                                                                                |
| ---------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `category` | `string?`  | Full bodies for one category. Allowed: `reactivity`, `jsx`, `context`, `architecture`, `islands`, `ssr`, `ssg`, `bundling`, `testing`, `lifecycle`, `build`, `ci`, `best-practices`, `library-api`, `documentation`, `all`. Omit for the index |
| `name`     | `string?`  | Full body of the entry whose title contains this (case-insensitive). Most token-frugal drill-in                                                           |
| `full`     | `boolean?` | Return the entire catalog (tens of thousands of tokens). Default is the compact index
| `page`     | `number?`  | Index page (240 entries each). Default 1; the footer names the next page                                                                                     |

:::note{title="15 categories, only 8 accepted a `category` value until recently"}
The catalog's real category set is the 15 above (one `##` heading per section of `anti-patterns.md`, minus `Reactivity-Seam Adapter Mistakes` which folds into `reactivity`, and the `Memory Leak Classes` table which is not a bullet list and contributes no entries). The `category` enum used to hand-list only 8 of them — calling `{ category: 'islands' }`, `'ssr'`, `'ssg'`, `'bundling'`, `'build'`, `'ci'`, `'best-practices'`, or `'library-api'` failed zod validation for the tool's entire lifetime even though those sections parse fine. The enum is now DERIVED from the same category list `parseAntiPatterns` uses, so it can't drift out of sync with the doc again.
:::

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

```json
{ "category": "islands" }
```

```json
{ "page": 2 }
```

**Response shape** (no-arg call, captured against this repo's real catalog):

```text
# Pyreon Anti-Patterns — index (413 total, page 1 of 2, 10 categories)

Compact index — one line per entry; a long title is clamped with `…`. For the
full body of an entry call get_anti_patterns({ name: "<any fragment of the
title>" }); …

## Reactivity Mistakes (56)

- **Bare signal in JSX text**: `{count()}` → wrap in `{() => count()}` …
- **[FIXED, 2026-07] Module-level tracking collectors set-then-NULLED …

...

Showing entries 1-240 of 413. Next: get_anti_patterns({ page: 2 }).
```

:::warning{title="Common mistakes"}
- **`{ full: true }` is the multi-tens-of-thousands-of-token dump** — reach for the no-arg index to orient, then pull full bodies with `{ name }` once you know which entry matters.
- **No-arg returns the index, not full bodies** (behavior changed in the token-slim work). Full bodies need `{ name }`, `{ category }`, or `{ full: true }`.
- **The index is paginated — page 1 alone does not cover every category.** A category that happens to sit entirely on page 2 won't show its `## <Heading>` marker on page 1; either page through, or drill straight in with `{ category: '<slug>' }` if you already know which one you want.
:::

:::note{title="Behavior note"}
A token-budget CI gate (`src/tests/token-budget.test.ts`) keeps the index a DENSITY budget (average tokens/entry, max single line) rather than an absolute size ceiling, plus a design-boundary tripwire (the index must stay under 12,000 tokens — past that the fix is pagination, not a bigger number) and the ≥60%-smaller-than-full-dump ratio above.
:::

---

### get_changelog

Recent release notes for any `@pyreon/*` package, parsed from `packages/**/CHANGELOG.md` — no `git log` scraping. The tool parses each changelog into version entries (`{ version, changes[], dependencyUpdates[], empty }`) and returns the N most recent **substantive** versions (default 5). Pure dependency-update releases with no user-facing body ("ceremonial bumps") are filtered out by default — opt back in with `includeDependencyUpdates: true`.

**Parameters:**

| Param                      | Type       | Description                                                                                                                          |
| -------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `package`                  | `string?`  | Package name — accepts `"query"` or `"@pyreon/query"`. Omit for the index of all packages with their latest version                  |
| `limit`                    | `number?`  | Maximum number of substantive versions to return. Default `5`                                                                        |
| `includeDependencyUpdates` | `boolean?` | Re-include the bump-only releases the tool drops by default                                                                          |
| `since`                    | `string?`  | Only versions strictly newer than this (e.g. `"0.12.0"`). Useful when the agent knows the version it was trained against             |

**Example calls:**

```json
{ "package": "flow", "limit": 5 }
```

```json
{ "package": "@pyreon/router", "since": "0.12.0" }
```

:::warning{title="Common mistakes"}
- **Ceremonial bumps are filtered by default.** If you need dep-only releases (e.g. tracking when a transitive Pyreon dep flipped), pass `includeDependencyUpdates: true`.
- **Be explicit with `since`** — the parser treats `"0.27"` as `"0.27.0"`. Pass the full `"0.27.0"` to avoid a silent off-by-one.
- **It's per-package** — for a cross-package survey, call once per package.
- **Changelog entries describe *what* changed, not always *how* to migrate** — pair with `get_pattern` / `get_api` for shape changes.
:::

---

### audit_test_environment

Scan every `*.test.{ts,tsx}` under `packages/` for the mock-vnode anti-pattern (the PR #197 bug class — tests that construct `{ type, props, children }` literals or a custom `vnode()` helper instead of going through the real `h()` from `@pyreon/core`). Each file is classified `HIGH` / `MEDIUM` / `LOW` by the balance of mock-vnode literals + helper definitions + call-sites versus real `h()` calls + a `@pyreon/core` import. Three context-aware skips (helper-def vs binding discrimination, type-guard call-arg skip, template-string fixture mask) keep the false-positive rate low.

**Parameters:**

| Param     | Type      | Description                                                                                          |
| --------- | --------- | ---------------------------------------------------------------------------------------------------- |
| `minRisk` | `string?` | `"high"`, `"medium"`, or `"low"`. Default `"medium"` (surfaces HIGH + MEDIUM). `"low"` shows everything |
| `limit`   | `number?` | Maximum entries per risk group. Default `20`                                                          |

**Example call:**

```json
{ "minRisk": "medium" }
```

:::warning{title="Common mistakes"}
- **A HIGH finding isn't "this test is broken"** — it means the test relies heavily on mock vnodes. It may be correct given its scope; review the file and add a real-`h()` companion test if the contract assertion matters.
- **`minRisk: "low"` includes anything that even mentions a mock helper** — use `medium` for actionable signal, `high` for "would have prevented PR #197"-tier risk.
- **Run it from the monorepo root** — the scanner walks `packages/` from `process.cwd()`. From a subpackage dir you get a partial result.
- **It only scans existing test files** — missing test coverage is a separate concern (the coverage gate, not this audit).
:::

---

### audit_islands

Project-wide cross-file islands audit. It walks `packages/` + `examples/` and runs five detectors that auto-registry can't reach (manual `hydrateIslands({...})` for non-Vite consumers / library authors) and that the per-file `island-never-with-registry-entry` detector misses (it only catches the same-file shape):

- **`duplicate-name`** — two `island()` declarations sharing a name; the runtime hydrates only the first.
- **`never-with-registry-entry`** — a `hydrate: 'never'` island registered in any file's manual `hydrateIslands({ ... })`, defeating the zero-JS goal.
- **`registry-mismatch`** — a manual registry entry with no matching `island()` declaration anywhere (typo / removed island / forgotten import).
- **`nested-island`** — an `island()` whose loader-target file also contains an `island()` call; the outer's `hydrateRoot` replaces the inner before its loader runs.
- **`dead-island`** — an `island()` whose file is never imported statically or dynamically (unreachable code).

Each finding ships with file path + line/column + an actionable fix suggestion. This is the same scanner as the `pyreon doctor --check-islands` CLI flag — two surfaces, one detector set.

**Parameters:**

| Param  | Type       | Description                                                                                       |
| ------ | ---------- | ------------------------------------------------------------------------------------------------- |
| `json` | `boolean?` | Return raw JSON (`{ root, findings: [...], summary: {...} }`) instead of markdown — handy for CI gating |

**Example calls:**

```json
{}
```

```json
{ "json": true }
```

CI-gate it by piping `--json` and asserting `findings.length === 0`.

:::warning{title="Common mistakes"}
- **A project with zero `island()` declarations returns an empty findings array** (not an error) — run it from a project root that uses islands.
- **`registry-mismatch` only fires for manual `hydrateIslands({ ... })`** — apps using `hydrateIslandsAuto()` (the Vite plugin default) won't see it.
- **`dead-island` tracks static imports of the loader path** — a dynamic-import chain routed through registry indirection may not be statically traceable. Source-grep before deleting.
- **`nested-island` is never intentional composition** — the outer island's `hydrateRoot` replaces the inner subtree before it can hydrate. Flatten, or use a different boundary primitive.
:::

---

### get_dependency_fabric

Serves the **workspace dependency graph** `loom scan` writes to `loom-report.json` — the shape (packages, internal edges, depth), runtime cycles, the gating findings, and the blast-radius ranking that answers the question a graph exists to answer: *what does changing this reach?*

Call it with no arguments for the whole-fabric overview. Pass `package` for one package's declared runtime dependencies, its dependents, its depth and reach, and its own findings. The tool reads the report file rather than re-running the scan itself — loom's scan walks every file in the workspace, so importing and re-running it inside a tool call would make every question pay for a full scan.

Every rendering carries loom's honesty rule through. Loom reads **declared truth** — manifests and source imports, never a lockfile or the registry — so it cannot tell you which version is *installed*, and `unused-dep` is lexical evidence rather than proof: bins, plugin autoloads and CSS imports all load without an import statement. An agent that reads "unused" as "safe to delete" will delete a package a bin loads at runtime, which is exactly why the note travels with the data.

The report is a build artifact, so a report older than a day is flagged with its age, and a missing one returns instructions to run `loom scan` rather than an invented graph.

**Parameters:**

| Param     | Type      | Description                                                                    |
| --------- | --------- | -------------------------------------------------------------------------------- |
| `package` | `string?` | A workspace package name (e.g. `"@pyreon/router"`). Omit for the whole-fabric overview |

**Example calls + real response** (captured by running `loom scan` against this repo, then calling the tool — numbers will differ on your workspace and change as this repo grows):

```json
{}
```

```text
# Dependency fabric — 145 workspace package(s)

- internal edges: 768 · max depth: 8 · external deps: 167
- findings: 0 error · 0 warning · 259 info

## Blast radius — changing these reaches the most packages
- @pyreon/reactivity → 104 dependent(s)
- @pyreon/core → 95 dependent(s)
- @pyreon/runtime-dom → 64 dependent(s)
...

> Loom reads DECLARED truth — manifests + source imports. It cannot tell you
> which version is INSTALLED (no lockfile, no registry), and `unused-dep` is
> lexical evidence, not proof: bins, plugin autoloads and CSS imports load
> without an import statement.
```

```json
{ "package": "@pyreon/router" }
```

```text
# @pyreon/router

- version: 0.51.0
- depth: 4
- blast radius: 33 dependent(s)

## Declares (4 runtime)
`@pyreon/sized-map`, `@pyreon/core`, `@pyreon/reactivity`, `@pyreon/runtime-dom`

## Depended on by (29)
`@pyreon/docs`, `@pyreon/example-ai-reference`, ..., `@pyreon/zero`, `@pyreon/zero-content`

> Loom reads DECLARED truth — …
```

:::warning{title="Common mistakes"}
- **Reading `unused-dep` as "safe to delete"** — it is lexical evidence with INFO severity; bins, plugin autoloads and CSS imports load without an import statement. Verify before removing.
- **Asking it which version is installed** — loom reads manifests and source, never a lockfile or the registry.
- **Trusting a stale report** — the fabric changes with every dependency edit; the tool prints the artifact age, and you should re-run `loom scan` after one.
- **Expecting dev-dependency cycles** — loom excludes dev edges from cycle detection on purpose (monorepos legitimately share test utilities both ways).
:::

---

### get_atlas_catalog

Serves the **verified component catalog** `atlas scan` writes to `atlas-catalog.json` — every component with the props it actually takes, the values those props actually allow, and how many of its scenarios have been checked. All of it is read from your source, so an assistant writing UI code stops guessing prop names.

Each component line carries three scenario counts — **verified**, **failing**, **unverified**. That split is deliberate: Atlas ships six named checks (`a11y`, `interaction`, `ssrParity`, `leak`, `reactivityCoverage`, `snapshot`), and depending on the scan environment some don't run at all — a plain-`node` `atlas scan` skips `leak` (needs a GC hook — run under `bun` or `node --expose-gc`) and both browser-only checks (`reactivityCoverage`, `snapshot` — need `atlas verify-browser`). So a catalogued component is not automatically a fully-checked one, and collapsing the counts would let "we have a catalog entry" read as "this is known good".

If no catalog is present the tool returns instructions to run `atlas scan` rather than an invented list — the whole value of the catalog is that it is derived from real components.

**Parameters:**

| Param | Type      | Description                                               |
| ----- | --------- | --------------------------------------------------------- |
| `tag` | `string?` | Only components carrying this tag. Omit for the full set.  |

**Example call + real response** (captured by running `atlas scan` against `packages/ui/components`, this repo's private component library — 108 components, 489 scenarios):

```json
{}
```

```text
# Atlas catalog — 108 component(s)

Verified = at least one check ran and none failed. Unverified means nothing
examined the scenario; it is NOT a pass. Use `get_atlas_component` for the
exact prop values of one component.

## Combobox [layout]
Combobox — 1 scenario(s), 1 verified. Props: children.
props: children(()=>…)
scenarios: 1 (1 verified, 0 failing, 0 unverified)

## PasswordInput [form]
PasswordInput — 1 scenario(s), 1 verified. Props: visible, defaultVisible, onVisibleChange, showLabel, hideLabel.
props: visible(bool), defaultVisible(bool), onVisibleChange(()=>…), showLabel(text), hideLabel(text)
scenarios: 1 (1 verified, 0 failing, 0 unverified)
...
```

```json
{ "tag": "form" }
```

Filters the same index down to components tagged `form` (e.g. `PasswordInput` above).

:::warning{title="Common mistakes"}
- **Treating a catalogued component as a verified one** — the counts on each line are the point. `unverified` means nothing examined that scenario; it is not a pass.
- **Calling it before `atlas scan` has run** — the catalog is a build artifact, so the tool returns setup instructions rather than a stale or invented list.
- **Expecting per-prop detail here** — the index is deliberately token-frugal. Use [`get_atlas_component`](#get_atlas_component) for one component's exact prop values.
:::

---

### get_atlas_component

Prescriptive usage for one catalogued component: required and optional props with their exact allowed values, which props are **reactive** (pass a signal accessor, not a value), a known-good example when a scenario has genuinely been verified, and `avoid:` lines for scenarios that actually failed a check.

An unverified example is still offered — it is a useful starting point — but it is labelled `example (UNVERIFIED …)` rather than `correct (verified)`. The consumer of this answer has no other view of the component and cannot check it, so the stronger word has to be earned.

Unknown names come back with near-match suggestions instead of a bare miss.

**Parameters:**

| Param  | Type     | Description                                          |
| ------ | -------- | ---------------------------------------------------- |
| `name` | `string` | Component name exactly as it appears in the catalog   |

**Example call + real response** (same catalog as above):

```json
{ "name": "Button" }
```

```text
# Button
Button — 12 scenario(s), 12 verified. Props: state, size, variant, children.
tags: form
source: src/index.ts

optional: state(primary|secondary|danger|success), size(small|medium|large), variant(solid|outline|subtle|ghost|link), children(text)

correct (verified): {"children":"Button","state":"primary","size":"small","variant":"solid"}
```

:::warning{title="Common mistakes"}
- **Reading `example (UNVERIFIED …)` as a known-good example** — it is args from a scenario nothing has checked. Only `correct (verified)` carries evidence.
- **Passing a resolved value to a prop listed as reactive** — those take an accessor (`() => count()`), and passing the value captures it once.
- **Inventing a value for a prop whose allowed set is printed** — `state(primary|secondary|danger|success)` above is the COMPLETE list for that component; nothing else is valid.
:::

---

### get_api_client

Serves the **generated API client** `lathe generate` wrote — every operation with its method, path, summary and the exact symbols it exports (the endpoint, the `use<Op>` hook, and `<op>Stream` / `use<Op>Stream` for a streaming operation), grouped by the module they live in, plus every model with its kind and whether it travels in requests, responses or both.

It reads the `api-surface.json` Lathe writes next to the generated code (found by searching the working directory for one that sits beside a `lathe-manifest.json`), so it describes the client the agent will actually import — not a re-reading of the spec, which can describe an API the committed client does not implement. The surface is the same file `lathe check` and `lathe diff` read.

**Parameters:**

| Param    | Type      | Description |
| -------- | --------- | ----------- |
| `search` | `string?` | Only operations whose id, path or summary contains this |
| `path`   | `string?` | The generated directory or its `api-surface.json` — for a project with several clients |

**Example call + real response** (the `streams.json` fixture from `@pyreon/lathe`'s tests):

```json
{}
```

```text
# Streams — 5 operation(s), 4 model(s)
generated at `./src/gen`

## chat
- `createChat` POST /chat (streams sse ChatChunk) — Chat completion → `createChat`, `createChatStream`, `useCreateChat`, `useCreateChatStream`

## rooms
- `createRoom` POST /rooms → `createRoom`, `useCreateRoom`
- `roomEvents` GET /rooms/:room/events (streams sse RoomEvent) — Live events in a room → `roomEvents`, `roomEventsStream`, `useRoomEventsStream`

## Models
- `ChatChunk` (1 fields, response)
- `ChatRequest` (2 fields, request)
…
```

:::warning{title="Common mistakes"}
- **Guessing a hook name from the spec's `operationId`** — the generated name is normalized, and a stream-only operation has no `use<Op>` at all. The symbols listed are the real exports.
- **Calling it before `lathe generate` has run** — the surface is a generation artifact; the tool returns setup instructions rather than a guessed client.
:::

---

### get_api_operation

One generated operation's **typed signature**: each parameter with its location (`path` / `query`) and whether it is required, the request body, the response and stream event types, the fields of every model they name, and example calls shaped by those types — the direct endpoint call, the query or mutation hook, and a `for await` over the stream (plus its hook) when the operation streams. Imports are written relative to the working directory. An unknown name gets near-match suggestions.

**Parameters:**

| Param       | Type      | Description |
| ----------- | --------- | ----------- |
| `operation` | `string`  | The generated operation name (the endpoint export) |
| `path`      | `string?` | The generated directory or its `api-surface.json` |

**Example call + real response:**

```json
{ "operation": "roomEvents" }
```

````text
# `roomEvents` — GET /rooms/:room/events

Live events in a room

Endpoint in `./src/gen/endpoints/rooms.ts`; hooks in `./src/gen/queries/rooms.ts`.

## Input
- `room` (path, required): string

## Output
- response: unknown
- stream: sse RoomEvent — one event per iteration

## Models it uses
- `RoomEvent` { at: integer; kind: enum("join"|"leave"|"message"); text: string (optional) }

## Call it

```ts
import { roomEventsStream } from './src/gen/endpoints/rooms'

for await (const event of roomEventsStream({ params: { room: '…' } })) {
  // break closes the connection
}

import { useRoomEventsStream } from './src/gen/queries/rooms'

const live = useRoomEventsStream(() => ({ params: { room: '…' } }))
```
````

:::warning{title="Common mistakes"}
- **Passing a path parameter under `query`** — the location is printed per parameter; path parameters go in `params`.
- **Calling a `use<Op>` hook with a value** — generated hooks take an accessor (`() => args`) so signal reads stay reactive.
- **Awaiting a stream function** — `<op>Stream(...)` returns an async iterable; iterate it, and `break` closes the connection.
:::

---

### explain_api_diff

The **client-contract diff** between two versions of an API. Each side is a spec (JSON or YAML), an `api-surface.json`, or `<git-rev>:<path>` (`main:openapi.yaml` — the base of a PR is not on disk); `after` defaults to the generated client in the project.

It runs `@pyreon/lathe`'s own classifier — the same one `lathe diff` and `lathe check` use, loaded lazily so server startup does not pay for it — so the two can never disagree. Severities are from the **client's** point of view: a response field turning optional is breaking, a request field doing so is not. The report lists breaking changes first, names the generated symbols each change reaches (a model change is traced through other models to every operation that uses it), and ends with what to check in the code for every breaking change.

**Parameters:**

| Param    | Type      | Description |
| -------- | --------- | ----------- |
| `before` | `string`  | The BEFORE side: spec, `api-surface.json`, or `<git-rev>:<path>` |
| `after`  | `string?` | The AFTER side, same forms. Omit to use the project's generated client |

**Example call + response shape** (symbols and counts depend on your spec):

```json
{ "before": "main:openapi.yaml", "after": "openapi.yaml" }
```

```text
### API contract: 1 breaking, 0 additive

#### Breaking (1)

| Change | Subject | Detail | Generated code affected |
| --- | --- | --- | --- |
| `field-now-optional` | `Customer.email` | required → optional | `getOrder`, `useGetOrder` (orders); `updateOrder`, `useUpdateOrder` (orders) |

### What to check in the code

- `Customer.email` (`field-now-optional`): the app reads it unconditionally today and it typechecks only because it never asks — guard every read.
```

:::warning{title="Common mistakes"}
- **Trusting a green typecheck after regenerating** — the breaking changes here are the ones that still COMPILE and fail at runtime.
- **Reading `member-added` as harmless** — a `switch` over that value can now receive a member it does not handle.
:::

## How it works

The server runs as a subprocess communicating over **stdio**. When an AI assistant needs Pyreon-specific knowledge it calls one of the tools above instead of guessing from training data — so the assistant always has accurate, current API information regardless of its training cutoff.

A few architectural notes worth knowing:

- **Manifest-driven.** `get_api` reads `api-reference.ts`, which is generated from each package's `manifest.ts` via `bun run gen-docs`. A marker-pair protocol (`<gen-docs:api-reference:start @pyreon/<name>>`) lets some packages be generated and others stay hand-written during incremental migration. `mcp_overview` reads this package's own manifest at runtime — so the overview, the `get_api` database, and this docs page share one source.
- **Project-context caching.** Each `createServer()` instance keeps its own cached scan of routes, components, and islands. The cache auto-resets when `process.cwd()` changes between invocations, so one server can operate across multiple projects in a single session.
- **AST-based detectors.** `validate`, `diagnose`, and `explain_error` reuse the static detectors from `@pyreon/compiler` (`detectReactPatterns`, `detectPyreonPatterns`, `detectNativePatterns`) — the same code paths that back the lint rules — so a detection in the IDE matches a detection in CI.
- **Read-only + deterministic.** Every tool returns text. Nothing in the server mutates files, and no LLM is embedded — the consuming agent does the reasoning, a human gates any change.

The project-scanning tools (`get_routes`, `get_components`, `get_content_*`) use the TypeScript-based scanner from `@pyreon/compiler` to analyze the actual project source. Results are cached per working directory and regenerated when the directory changes.

---

## Troubleshooting

### The server starts but no tools appear in the client

The server speaks JSON-RPC over stdio. If the client connected but `tools/list` is empty, the tool registrations failed silently — usually a Node version mismatch (the server uses dynamic imports for some lazy paths).

- Verify the client launches the server with Node `>= 18`.
- Look for `[mcp]` stderr lines in the client's log directory (Claude Code: `~/Library/Logs/Claude/`, Cursor: settings → output panel → "MCP Logs").
- Test the server in isolation with `bunx pyreon-mcp` and send a JSON-RPC `initialize` frame. If `initialize` succeeds but `tools/list` is empty, file an issue with the stderr output.

### `get_pattern` / `get_anti_patterns` / `get_changelog` in a consumer project

These tools read from Pyreon-monorepo files (`docs/src/content/docs/patterns/*.md`, `.agents/rules/anti-patterns.md`, `packages/**/CHANGELOG.md`). When the server runs from a **consumer project** (`bunx @pyreon/mcp`), those files aren't reachable in the working tree — so the published package **bundles a snapshot** of them (a `content/` dir shipped in the tarball, regenerated on every build). The loaders prefer the live monorepo source when present (so in-repo dev always sees the latest) and fall back to the bundled snapshot otherwise, so the tools return real content in consumers. The bundled changelogs / patterns / anti-patterns reflect the version of `@pyreon/mcp` you installed — upgrade the package to refresh them. The "could not locate" message now only appears if BOTH the live source and the bundled snapshot are missing (a broken install).

### `audit_test_environment` / `audit_islands` report zero findings in a known-broken codebase

The audit scanners walk from `process.cwd()`. If the server's working directory isn't the project root, the walk may miss your `src/`. Most clients spawn the server with `cwd` set to the open project — verify by calling `get_components` first; if *that* returns zero, the cwd is wrong.

### `validate` always returns "✓ No issues found"

`validate` runs three AST-based detectors (`detectReactPatterns`, `detectPyreonPatterns`, `detectNativePatterns`). If all three return empty, the snippet is clean. If you expect a detection that doesn't fire:

- Confirm the snippet is syntactically valid TypeScript / TSX. The detectors silently skip parse errors.
- Check the detector's exact pattern shape (`get_anti_patterns` shows the rule body for every detector code). For example, `props-destructured-body` only fires inside a PascalCase JSX component body, not in a free function.
- The native detector only fires when the snippet imports `@pyreon/primitives` — a pure-web snippet never produces native diagnostics.

### `get_content_collection` returns "no content.config found"

The content tools work with `@pyreon/zero-content`-shaped apps. They look for a `content.config.{ts,mts,js,mjs}` from the working directory. If the server's cwd isn't the project root (or the project doesn't use `@pyreon/zero-content`), the tool returns a clear fallback message rather than an error.

### `get_changelog` returns "not found" for a known package

The lookup walks up from cwd for `packages/**/CHANGELOG.md`, falling back to the package's bundled changelog snapshot when no live `@pyreon/*` package is found (the consumer case). If you renamed a package directory but kept the npm name, the walker won't find the live file (the bundled snapshot still resolves it). The tool accepts both `query` and `@pyreon/query` — try both forms.

### The server hangs on first connection

The server makes no network calls or long startup scans — it returns `initialize` in `<50ms`. If it hangs, the client is most likely waiting for stdout buffering to flush. Make sure the client's MCP transport reads line-delimited JSON-RPC rather than blocking on a chunk size.

---

## Exports summary

`@pyreon/mcp` is primarily a binary. Its ONLY module entry is `src/index.ts` (no subpath exports in `package.json`), and that file exports exactly two runtime symbols — verified by importing the built module and listing its keys, not assumed from source reading:

| Export                    | Description                                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| CLI entry (`pyreon-mcp`)   | Starts the MCP server on stdio transport (runs when the module is invoked as a process, not on import)                          |
| `createServer()`           | Factory that returns a configured `McpServer` with all 24 tools registered (tests stand one up with an in-memory transport instead of stdio) |
| `matchesProcessEntry(meta, moduleUrl, resolvedEntryUrl)` | Pure helper deciding "is this module the process entry?" across runtimes — Bun / Node ≥24.2 expose `import.meta.main` directly; older Node needs the URL-comparison fallback this function implements. Exported so the fallback path is unit-testable without an actual old Node runtime. |

`API_REFERENCE`, `generateContext`, `ProjectContext`, `RouteInfo`, `ComponentInfo`, and `IslandInfo` are **internal** — used by the tool handlers inside `index.ts`, but not re-exported from the package, and there is no `@pyreon/mcp/<subpath>` export for them (`package.json` `exports` declares only `"."`; a deep-path import like `@pyreon/mcp/src/api-reference` fails to resolve — verified, not assumed). `API_REFERENCE` lives at `packages/tools/mcp/src/api-reference.ts` — inside this monorepo, reach it by a relative file path if you genuinely need the raw table, not a package-specifier import. `generateContext` / `ProjectContext` / `RouteInfo` / `ComponentInfo` / `IslandInfo` come from `@pyreon/compiler`'s project scanner — import them from `@pyreon/compiler` if you need the raw scan, not from `@pyreon/mcp`.
