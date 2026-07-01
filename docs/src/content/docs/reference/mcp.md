---
title: "MCP Server — API Reference"
description: "Model Context Protocol server — discoverability map, live API lookup, validation, migration, anti-pattern catalog, changelog, test-environment audit"
---

# @pyreon/mcp — API Reference

> **Generated** from `mcp`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [mcp](/docs/mcp).

MCP server (stdio transport) that exposes Pyreon\'s structured knowledge to AI coding assistants (Claude Code, Cursor, etc.). Sixteen tools: `mcp_overview` (start here — markdown table of every tool with "when to use" + example, read straight from this manifest), `get_api` (look up any Pyreon API), `validate` (catch React + Pyreon-specific anti-patterns in a snippet), `migrate_react` (auto-convert React code), `diagnose` (parse a Pyreon error into structured fix info; optional `componentSource` + `reactiveTrace` for causal diagnosis), `explain_error` (assemble a failure dossier from a full error report), `get_routes` / `get_components` (project introspection), `get_content_collection` / `get_content_entry` (enumerate `@pyreon/zero-content` collections + drill into one entry\'s frontmatter + heading outline), `get_browser_smoke_status` (which packages need a browser smoke test), `get_pattern` (canonical "how do I do X" docs), `get_anti_patterns` (the catalog from `.claude/rules/anti-patterns.md`), `get_changelog` (recent release notes per package), `audit_test_environment` (mock-vnode test scanner — PR #197 bug class), and `audit_islands` (project-wide islands cross-file audit — duplicate names, dead islands, registry drift, nested islands, never-with-registry).

## Features

- Sixteen tools covering discovery, lookup, validation, migration, diagnosis, introspection, audit
- stdio transport — drop-in compatible with every MCP client
- Project context cached per server instance, auto-invalidates on cwd change
- Manifest-driven — `get_api` reads `api-reference.ts`, regenerated from package manifests
- AST-based detectors — `validate` catches React + Pyreon-specific patterns statically
- Real-repo audit tools (`audit_test_environment`, `audit_islands`, `get_browser_smoke_status`) walk packages/

## Complete example

A full, end-to-end usage of the package:

```tsx
// .mcp/config.json — register the server with any MCP-aware client
{
  "mcpServers": {
    "pyreon": {
      "command": "bunx",
      "args": ["@pyreon/mcp"]
    }
  }
}

// Then from the client (Claude Code, Cursor, etc.):
//   mcp_overview()
//     → markdown table: tool | when_to_use | example (start here)
//   get_api({ package: 'flow', symbol: 'createFlow' })
//     → signature, example, common mistakes
//   validate({ code: '<MyButton onClick={handler}>...' })
//     → React-pattern + Pyreon-pattern diagnostics with line/col
//   get_pattern({ name: 'controllable-state' })
//     → canonical pattern body from docs/patterns/
//   get_anti_patterns({ category: 'reactivity' })
//     → reactivity foot-guns from .claude/rules/anti-patterns.md
//   get_changelog({ package: 'flow', limit: 5 })
//     → recent release notes filtered through ceremonial-bump removal
//   audit_test_environment({ minRisk: 'medium' })
//     → mock-vnode test files ranked HIGH / MEDIUM / LOW
//   audit_islands({})
//     → project-wide islands audit (5 cross-file foot-guns)
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`mcp_overview`](#mcp-overview) | constant | Returns a markdown table of every registered MCP tool with a one-sentence "when to use" description and a one-line examp |
| [`get_browser_smoke_status`](#get-browser-smoke-status) | constant | Companion to the `pyreon/require-browser-smoke-test` lint rule. |
| [`get_api`](#get-api) | constant | Look up any Pyreon API by `package` (e.g. |
| [`validate`](#validate) | constant | Two AST-based detectors run in parallel: `detectReactPatterns` flags "coming from React" mistakes (`useState`, `useEffec |
| [`explain_reactivity`](#explain-reactivity) | constant | The compiler's per-expression reactivity VERDICT for a snippet. |
| [`migrate_react`](#migrate-react) | constant | Convert React code to idiomatic Pyreon. |
| [`migrate_pyreon`](#migrate-pyreon) | constant | The Pyreon → correct-Pyreon codemod (parallel to `migrate_react`). |
| [`diagnose`](#diagnose) | constant | Parse a Pyreon runtime / build error into structured fix information. |
| [`explain_error`](#explain-error) | constant | The rich-context sibling of `diagnose`. |
| [`get_routes`](#get-routes) | constant | List every route in the current project — path, loader presence, guards, params, and named-route name. |
| [`get_components`](#get-components) | constant | List every component in the current project with its props and signal usage. |
| [`get_pattern`](#get-pattern) | constant | Fetch a canonical "how do I do X" pattern body from `docs/patterns/`. |
| [`get_anti_patterns`](#get-anti-patterns) | constant | Browse the anti-patterns catalog from `.claude/rules/anti-patterns.md`, token-frugal by default. |
| [`get_changelog`](#get-changelog) | constant | Recent release notes for any `@pyreon/*` package without scraping `git log`. |
| [`audit_test_environment`](#audit-test-environment) | constant | Scan every `*.test.{ts,tsx}` under `packages/` for the mock-vnode anti-pattern that caused PR #197\'s silent metadata dr |
| [`audit_islands`](#audit-islands) | constant | Project-wide cross-file islands audit (PR C of the islands DX roadmap). |

## API

### mcp_overview `constant`

```ts
tool: mcp_overview() → MarkdownTable
```

Returns a markdown table of every registered MCP tool with a one-sentence "when to use" description and a one-line example. Reads from this same manifest at runtime — single source of truth (the same data feeds `api-reference.ts`, `llms-full.txt`, and `docs/src/content/docs/mcp.md`). Intended as the first call for any AI agent connecting to the server: enumerates the surface so the agent can navigate by intent (e.g. "I need release notes" → `get_changelog`) rather than guessing tool names from `tools/list`.

**Example**

```tsx
mcp_overview()
// → | Tool | When to use | Example |
//   |------|-------------|---------|
//   | mcp_overview | Returns a markdown table of every registered MCP tool... | mcp_overview() |
//   | get_api | Look up any Pyreon API by package and symbol... | get_api({ package: 'flow', symbol: 'createFlow' }) |
//   | ...
```

**Common mistakes**

- Skipping this tool and calling `tools/list` instead — that returns names + parameter schemas but no "when to use" guidance, so an agent has to call multiple tools to figure out which one fits the task.

**See also:** `get_api`

---

### get_browser_smoke_status `constant`

```ts
tool: get_browser_smoke_status — no args
```

Companion to the `pyreon/require-browser-smoke-test` lint rule. Reports which browser-categorized Pyreon packages have at least one `*.browser.test.{ts,tsx}` file under `src/`. Uses the same `.claude/rules/browser-packages.json` single source of truth as the rule + the CI script. Lets an AI agent check coverage before writing a new browser package (so it adds a smoke test in the same PR) instead of discovering the failure when CI runs. Falls back with a clear message if the JSON isn't present (e.g. consumer apps that don't ship the Pyreon monorepo layout).

**Example**

```tsx
// Ask the MCP server:
//   "which Pyreon packages are missing browser smoke coverage?"
// Tool walks packages/, matches against .claude/rules/browser-packages.json,
// returns a coverage report.
```

**Common mistakes**

- Using the tool's output as a substitute for running the CI script — this tool only checks file existence, not the self-expiring-exemption check that `bun run lint:browser-smoke` performs

**See also:** `audit_test_environment`

---

### get_api `constant`

```ts
tool: get_api({ package: string; symbol: string }) → APIEntry
```

Look up any Pyreon API by `package` (e.g. `"flow"` or `"@pyreon/flow"`) and `symbol` (e.g. `"createFlow"`). Returns the canonical signature, example, foot-gun catalogue, and cross-references — drawn from `api-reference.ts`, which is regenerated from each package\'s `manifest.ts`. The single agent-facing entry point for "what does this API do and how do I avoid the common mistakes."

**Example**

```tsx
// Agent-side
get_api({ package: 'flow', symbol: 'createFlow' })
get_api({ package: '@pyreon/router', symbol: 'useTypedSearchParams' })
```

**Common mistakes**

- Passing the package name with a typo or wrong scope — `get_api({ package: "pyreon-flow", ... })` returns nothing. Use `"flow"` or `"@pyreon/flow"`; the tool accepts both.
- Expecting `symbol` to match a method on a returned instance (e.g. `Posts.useList`) — only TOP-LEVEL exports are in api-reference. Method-on-instance APIs are documented in the parent symbol's `summary` / `example`.
- Treating a 404 as "the API doesn't exist" — it may exist but the package's manifest is not yet on the MCP pipeline (~33 of ~55 packages migrated). Check the docs page or source as a fallback when get_api returns empty.
- Forgetting that `summary` may contain the answer to a follow-up question — read the full body before falling back to `get_pattern` / `validate` / source diving.

**See also:** `validate` · `get_pattern`

---

### validate `constant`

```ts
tool: validate({ code: string; filename?: string }) → Diagnostics[]
```

Two AST-based detectors run in parallel: `detectReactPatterns` flags "coming from React" mistakes (`useState`, `useEffect`, `className`, `onChange` on inputs, React-package imports), and `detectPyreonPatterns` flags "using Pyreon wrong" mistakes (`<For>` missing `by`, props destructured at component signature, `typeof process` dev gates, raw `addEventListener`, `Date.now() + Math.random()` IDs). Diagnostics are merged + sorted by line / column for top-down reading.

**Example**

```tsx
validate({ code: `
function MyComp(props) {
  const { value } = props          // → props-destructured
  return <For each={items}>{...}</For>  // → for-missing-by
}
` })
```

**Common mistakes**

- Treating zero diagnostics as "the code is correct" — `validate` is a STATIC detector. It catches the documented anti-patterns from `.claude/rules/anti-patterns.md` but does NOT verify runtime semantics, cross-file consistency, type correctness, or compiler output. Pair with `tsc` + tests for full coverage.
- Omitting the `filename` arg for path-sensitive detectors — some detectors (e.g. `pyreon/no-window-in-ssr` with its `exemptPaths` option) need the path to know whether the file is server-only-exempt. Without it the diagnostic may misfire or fail to fire.
- Running `validate` on a snippet that is NOT a full file — detectors expect complete syntax (every `import`, every `function`). Passing a partial expression yields no diagnostics, which can be mistaken for "clean".
- Calling `validate` after the code is already merged — it's a pre-commit / before-paste tool. After-the-fact use is fine but the maximum value is catching the bug BEFORE it ships.

**See also:** `get_anti_patterns` · `migrate_react`

---

### explain_reactivity `constant`

```ts
tool: explain_reactivity({ code: string; filename?: string }) → ReactivityMap
```

The compiler's per-expression reactivity VERDICT for a snippet. The Pyreon compiler already decides, while emitting codegen, whether each JSX expression is reactive or baked static — `explain_reactivity` surfaces that ground truth via `analyzeReactivity`: every expression classified `live` / `live prop` / `live attr` / `baked once` / `hoisted static`, merged with the `detectPyreonPatterns` footguns, over an annotated source view. Where `validate` reports BUGS, this reports the whole MAP: an agent sees that `<div>{qty}</div>` compiled to `baked once` (dead) BEFORE it ships the stale-closure / destructured-props / static-when-meant-reactive bug. The reactivity 'type-check' surface for AI agents.

**Example**

```tsx
explain_reactivity({ code: `
function Cart(props) {
  const { qty } = props            // → footgun: props-destructured-body
  const price = signal(9.99)
  return <div>{qty} × {price()}</div>  // {qty} → baked once (dead), {price()} → live
}
` })
```

**Common mistakes**

- Confusing it with `validate` — `validate` lists anti-patterns; `explain_reactivity` classifies EVERY expression live/static so you can spot a binding that silently won't update even when no footgun fires.
- Passing a partial expression instead of a full component — the compiler needs complete JSX to classify bindings; a fragment yields "No reactive expressions detected".
- Reading a `baked once` verdict as an error — static is often correct (literal text, one-time content). It is only a bug when that expression was MEANT to update; the tool flags the shape, you decide intent.

**See also:** `validate` · `get_anti_patterns`

---

### migrate_react `constant`

```ts
tool: migrate_react({ code: string; filename?: string }) → MigrationResult
```

Convert React code to idiomatic Pyreon. Handles `useState` → `signal()`, `useEffect` → `effect()`, `className` → `class`, `onChange` → `onInput`, `useMemo` → `computed()`, React imports → Pyreon imports. Reports per-edit fixable diagnostics so callers can apply or review.

**Example**

```tsx
migrate_react({ code: `
import { useState, useEffect } from 'react'
function Counter() {
  const [count, setCount] = useState(0)
  useEffect(() => { console.log(count) }, [count])
  return <button onClick={() => setCount(count + 1)}>{count}</button>
}
` })
```

**Common mistakes**

- Expecting the migration to handle every React feature — currently covers the most common hooks/JSX patterns. Class components, Concurrent React APIs, Suspense boundaries, and React-specific libs (react-router, redux) are NOT migrated automatically; the result will flag remaining issues but won't rewrite them.
- Running `migrate_react` on a file that's already mostly Pyreon — it's idempotent against already-migrated code (nothing flagged → nothing changed), so the cost is just the parse pass; safe to re-run.
- Forgetting that `useEffect(() => fn, [deps])` → `effect(() => fn)` changes semantics: Pyreon effects auto-track via signal reads, the explicit deps array is dropped. Verify your effects read the same signals the React deps array listed.
- Trusting the migration to produce idiomatic Pyreon — the output is CORRECT but mechanical. Pair with `get_pattern` after migration to apply Pyreon-native shapes (e.g. `<Show when={() => …}>` instead of ternaries; `<For>` instead of `.map()`).

**See also:** `validate`

---

### migrate_pyreon `constant`

```ts
tool: migrate_pyreon({ code: string; filename?: string }) → PyreonMigrationResult
```

The Pyreon → correct-Pyreon codemod (parallel to `migrate_react`). Auto-fixes ONLY the mechanically-safe footguns `validate` / `explain_reactivity` flag — `sig(v)` → `sig.set(v)`, `<For key={k}>` → `<For by={k}>`, and dropping `x as unknown as VNodeChild` — and returns every OTHER detected footgun (props-destructured, on-click-undefined, raw-add-event-listener, …) as a manual-fix list. This is what makes those three `detectPyreonPatterns` codes report `fixable: true`; a conservative codemod (span-based, idempotent, non-overlapping) that never mangles code, so an agent can apply the result verbatim.

**Example**

```tsx
migrate_pyreon({ code: `
const count = signal(0)
count(1)                                       // → count.set(1)
const list = <For each={a} key={k}>{…}</For>   // → <For each={a} by={k}>
const node = (x as unknown as VNodeChild)      // → x
` })
```

**Common mistakes**

- Expecting it to fix everything `validate` flags — only the three mechanically-safe codes are auto-fixed; the rest (props-destructured, on-click-undefined, raw-add-event-listener, date-math-random-id) need human judgement and come back in `remaining`.
- Running it as a formatter — it only rewrites the flagged footgun spans; whitespace / style elsewhere is untouched (pair with your formatter).
- Skipping `validate` afterwards — `migrate_pyreon` clears the mechanical footguns, but re-run `validate` to confirm the `remaining` (human) issues are addressed.

**See also:** `validate` · `explain_reactivity` · `migrate_react`

---

### diagnose `constant`

```ts
tool: diagnose({ error: string, componentSource?: string, reactiveTrace?: ReactiveTraceEntry[], filename?: string, phase?: string }) → DiagnoseResult
```

Parse a Pyreon runtime / build error into structured fix information. **String-only call is unchanged** (probable cause + fix + related docs from the regex pattern table — fully backward-compatible). v2 adds OPTIONAL structured context for richer, causal diagnosis: pass `componentSource` and the tool runs the static Pyreon detectors over it and maps each hit to the documented anti-pattern catalog entry (the `detectorCodes` bridge); pass `reactiveTrace` (the `ErrorContext.reactiveTrace` from `@pyreon/core`, populated in dev) and the tool formats the causal sequence of signal writes leading to the crash. The tool is deterministic — it assembles structured context, the calling agent reasons over it (no embedded LLM). Use the enriched form when you have the failing component + the error report; use the bare string form for a quick "what does this error mean".

**Example**

```tsx
// v1 — unchanged, backward-compatible
diagnose({ error: 'Cannot redefine property X on object [object Object]' })
// → cause: configurable: false on a getter; fix: set configurable: true

// v2 — structured context → causal diagnosis
diagnose({
  error: 'name is stale after parent update',
  componentSource: 'function G({ name }) { return <div>{name}</div> }',
  reactiveTrace: [{ name: 'name', prev: '"a"', next: '"b"', timestamp: 1 }],
})
// → base diagnosis + "Static detector findings: props-destructured"
//   + matched anti-pattern entry + the reactive run-up
```

**Common mistakes**

- Assuming v2 changed the string-only behaviour — it did not; an error-only call returns byte-identical output to before. The enrichment sections appear ONLY when componentSource / reactiveTrace are supplied
- Expecting the tool to return a fix patch — it returns structured CONTEXT (regex diagnosis + detector hits + matched anti-patterns + reactive run-up). The agent reasons over it; the tool does not embed a model
- Passing a production error report and expecting `reactiveTrace` content — the trace is dev-only (it tree-shakes out of prod builds), so prod reports carry `reactiveTrace: undefined` and the tool degrades to the v1 base diagnosis

**See also:** `validate` · `get_anti_patterns` · `explain_error`

---

### explain_error `constant`

```ts
tool: explain_error({ report: string; componentSource?: string }) → FailureDossier
```

The rich-context sibling of `diagnose`. `diagnose` matches an error STRING against known footguns; `explain_error` takes a full `ErrorContext`-shaped report — crucially the `reactiveTrace` (the causal SEQUENCE of signal writes from @pyreon/core's error reports) — and assembles a structured failure dossier: the reactive run-up + heuristic findings (empty-trace / nullish-then-crash / write-storm / last-write-correlation / type-flip), optional static `detectPyreonPatterns` on the component source, and correlated anti-pattern catalogue entries. The server only assembles + applies cheap heuristics; the consuming agent reasons over the dossier and a human gates any patch (the tool returns text only — no mutation, no LLM dependency). Use it when an agent has a captured Pyreon crash and the stack trace alone is not enough — the reactive sequence shows *how* the app reached the failing state.

**Example**

```tsx
explain_error({ report: JSON.stringify(errorContext) })
// errorContext from registerErrorHandler(ctx => …) in dev;
// ctx.reactiveTrace is the high-signal field
```

**Common mistakes**

- Passing only an error string — that is what `diagnose` is for. `explain_error` wants the structured report (phase, component, props, reactiveTrace) to be worth more than `diagnose`
- Expecting it to apply a fix — it returns a dossier + suspected cause only. Repair is human-gated by construction (the tool has no write capability)
- Capturing the report in production — `reactiveTrace` is dev-only (tree-shaken in prod), so the highest-signal section will be empty. Capture in dev

**See also:** `diagnose` · `validate` · `get_anti_patterns`

---

### get_routes `constant`

```ts
tool: get_routes() → Route[]
```

List every route in the current project — path, loader presence, guards, params, and named-route name. Walks the project source from `process.cwd()` down. Cached per server instance with auto-invalidation on `cwd` change.

**Example**

```tsx
get_routes()
// → [{ path: '/', name: 'home', hasLoader: true, params: [] }, ...]
```

**Common mistakes**

- Calling `get_routes` from outside a Pyreon project (no `package.json` with `@pyreon/router` or `@pyreon/zero` reachable from `process.cwd()`) — returns an empty array. Run from the project root, not from `~/` or a parent directory.
- Expecting the route list to update mid-session after file changes — the scanner caches per server-instance + cwd. Restart the MCP server or change cwd to refresh.
- Treating `hasLoader: false` as "no data" — the route may load data via `useQuery` in the component body. `hasLoader` reflects the `export const loader = …` convention only.

**See also:** `get_components`

---

### get_components `constant`

```ts
tool: get_components() → ComponentInfo[]
```

List every component in the current project with its props and signal usage. Same scanner as `get_routes`. Useful for an agent before generating new code that needs to reference existing components.

**Example**

```tsx
get_components()
// → [{ name: 'Button', file: 'src/Button.tsx', props: ['onClick', 'children'], signals: ['count'] }, ...]
```

**Common mistakes**

- Trusting the `props` list to be complete — the scanner extracts props from the FIRST parameter type annotation or destructure. Components using prop spread (`<Comp {...rest}>`) or computed prop shapes won't have their forwarded keys listed.
- Expecting `signals` to count signals declared INSIDE the component body — yes, those are listed; but signals imported from another module and used here are NOT listed (the scanner is per-file).
- Calling outside a Pyreon project — same caveat as `get_routes`: returns empty if the scanner can't find a project root.

**See also:** `get_routes`

---

### get_pattern `constant`

```ts
tool: get_pattern({ name?: string }) → PatternBody | string[]
```

Fetch a canonical "how do I do X" pattern body from `docs/patterns/`. 16 foundational patterns ship: `controllable-state`, `data-fetching`, `dev-warnings`, `dynamic-fields`, `event-listeners`, `form-fields`, `imperative-toasts`, `islands`, `keyed-lists`, `reactive-context`, `reactive-spread`, `routing-setup`, `signal-writes`, `ssr-safe-hooks`, `state-management`, `styler-theming`. Omit `name` to list available patterns. Drop a new `docs/patterns/<slug>.md` file to add one — picked up on next call.

**Example**

```tsx
get_pattern({ name: 'controllable-state' })
// → full canonical pattern body
get_pattern({})
// → [{ name: 'controllable-state', summary: '...' }, ...]
```

**Common mistakes**

- Passing a name in CamelCase or PascalCase — pattern names are kebab-case (`controllable-state`, not `ControllableState`). A wrong-case name 404s.
- Expecting the pattern list to include every Pyreon idiom — `get_pattern` covers the 16 foundational shapes (data fetching, forms, signal writes, etc.). Specialized patterns (PMTC, native compat, devtools wiring) live elsewhere in the docs.
- Confusing patterns with anti-patterns — `get_pattern` returns "how to do X correctly"; `get_anti_patterns` returns "what to avoid". They're complementary.

**See also:** `get_anti_patterns`

---

### get_anti_patterns `constant`

```ts
tool: get_anti_patterns({ category?: 'reactivity'|'jsx'|'context'|'architecture'|'testing'|'lifecycle'|'documentation'|'all'; name?: string; full?: boolean }) → string
```

Browse the anti-patterns catalog from `.claude/rules/anti-patterns.md`, token-frugal by default. **No args → a COMPACT INDEX** (one line per entry: title + `[detector: <code>]` tag + one-sentence hook; ≈3.3K tokens vs the ≈14K full dump — a ~76% cut on the common orient call). Drill in deliberately: `{ name }` → the single matching entry\'s full body (cheapest); `{ category }` → full bodies for one category; `{ full: true }` → entire catalog (≈14K, explicit opt-in). The index keeps per-category `## <Heading>` markers so categories are still discoverable in one call; each `[detector: <code>]` tag pairs the entry with the live `validate` detector.

**Example**

```tsx
get_anti_patterns()
// → compact index (~3.3K): titles + detector tags + one-line hooks
get_anti_patterns({ name: 'Destructuring props' })  // → that entry's full body
get_anti_patterns({ category: 'reactivity' })       // → full bodies, one category
get_anti_patterns({ full: true })                   // → entire catalog (~14K)
```

**Common mistakes**

- Reaching for `{ full: true }` to "see the anti-patterns" — that is the ~14K dump. The no-arg index is the orient call; pull full bodies with `{ name }` once you know which entry matters
- Expecting no-arg to return full bodies — it returns the index (behaviour changed in the token-slim PR). Full bodies need `{ name }`, `{ category }`, or `{ full: true }`

**See also:** `validate` · `get_pattern`

---

### get_changelog `constant`

```ts
tool: get_changelog({ package?: string; limit?: number; includeDependencyUpdates?: boolean; since?: string }) → ChangelogEntry[]
```

Recent release notes for any `@pyreon/*` package without scraping `git log`. Parses `packages/**/CHANGELOG.md` into version entries (`{ version, changes[], dependencyUpdates[], empty }`) and returns the N most recent substantive versions (default 5). Filters out ceremonial version bumps (pure dependency-update releases with no user-facing body) by default — opt back in with `includeDependencyUpdates: true`. `since: "0.12.0"` returns the delta from a known floor — useful when an agent knows the version it was trained against.

**Example**

```tsx
get_changelog({ package: 'flow', limit: 5 })
get_changelog({ package: '@pyreon/router', since: '0.12.0' })
```

**Common mistakes**

- Forgetting that ceremonial version bumps are filtered by default — if you NEED the dep-only releases (e.g. tracking when a transitive Pyreon dep flipped), pass `includeDependencyUpdates: true`. Otherwise the gap between "what changed" and "what shipped" can confuse a coverage analysis.
- Passing `since: "0.27"` (without patch) — the parser does a semver-aware comparison and treats `"0.27"` as `"0.27.0"`. Be explicit (`"0.27.0"`) to avoid silent off-by-one.
- Omitting `package` and expecting a multi-package digest — the tool is per-package. For a cross-package release survey, call once per package or read the release notes on GitHub.
- Trusting changelog entries to spell out the migration — they describe WHAT changed, not always HOW to migrate. Pair with `get_pattern` / `get_api` for shape changes.

**See also:** `get_api`

---

### audit_test_environment `constant`

```ts
tool: audit_test_environment({ minRisk?: 'high' | 'medium' | 'low'; limit?: number }) → AuditReport
```

Scan every `*.test.{ts,tsx}` under `packages/` for the mock-vnode anti-pattern that caused PR #197\'s silent metadata drop. Files are classified HIGH / MEDIUM / LOW based on the balance of mock-vnode literals + helpers + helper-call sites vs real `h()` calls + `@pyreon/core` import. Three context-aware skips (helper-def vs binding discrimination, type-guard call-arg skip, template-string fixture mask) keep the false-positive rate low. Run before merging a new test file or after a framework change.

**Example**

```tsx
audit_test_environment({ minRisk: 'medium', limit: 10 })
// → grouped report with HIGH / MEDIUM / LOW sections
```

**Common mistakes**

- Treating a HIGH finding as "this test is broken" — HIGH means the test relies HEAVILY on mock vnodes. The test may still be correct given its scope (e.g. testing a helper that only operates on vnode shapes); review the file and pair with a real-`h()` companion test if the contract assertion matters.
- Calling with `minRisk: "low"` and getting overwhelmed — LOW includes any file that even mentions a mock vnode helper. Use `medium` for actionable signal, `high` for "would have prevented PR #197"-tier risk.
- Running outside the monorepo root — the scanner walks `packages/` from `process.cwd()`. From a subpackage dir, you get a partial result.
- Expecting it to flag missing tests — it ONLY scans existing test files. Missing test coverage is a separate concern (coverage gate, not audit_test_environment).

**See also:** `get_browser_smoke_status` · `audit_islands`

---

### audit_islands `constant`

```ts
tool: audit_islands({ json?: boolean }) → IslandAuditReport
```

Project-wide cross-file islands audit (PR C of the islands DX roadmap). Walks `packages/` + `examples/` and runs five detectors that auto-registry can\'t reach (manual `hydrateIslands({...})` for non-Vite consumers / library authors) AND PR G\'s per-file `island-never-with-registry-entry` detector misses (it only catches the same-file shape): `duplicate-name`, `never-with-registry-entry`, `registry-mismatch`, `nested-island`, `dead-island`. Each finding ships with file path + line/column + actionable fix suggestion. Companion to the `pyreon doctor --check-islands` CLI flag (same scanner, same five detectors). Run before merging an island PR; CI gate by piping `--json` and grepping `findings.length > 0`.

**Example**

```tsx
audit_islands({})
// → markdown-grouped report with one section per finding code

audit_islands({ json: true })
// → machine-readable { root, findings: [...], summary: {...} }
```

**Common mistakes**

- Running outside a project that uses islands — the audit walks `packages/` + `examples/` from `process.cwd()`. A project with zero `island()` declarations returns an empty findings array (not an error).
- Treating `registry-mismatch` as a hard error in auto-registry apps — it only fires for MANUAL `hydrateIslands({ ... })` calls. Apps using `hydrateIslandsAuto()` (Vite plugin default) won't see this finding even if they'd be vulnerable to the same drift in a manual setup.
- Expecting `dead-island` to catch every never-used island — the detector tracks static imports of the loader path. Dynamic-import chains routed through a registry indirection may not be statically traceable; verify by source-grepping the loader path before deleting.
- Confusing `nested-island` with intentional island composition — the outer island's `hydrateRoot` REPLACES the inner subtree before the inner can hydrate. If you genuinely need nested islands, flatten or use a different boundary primitive.

**See also:** `audit_test_environment` · `get_anti_patterns`

---

## Package-level notes

> **Project-context caching:** Each `createServer()` instance maintains its own cached context (routes, components, islands). The cache auto-resets when `process.cwd()` changes between tool invocations, so the same server can operate across multiple projects in one session.

> **Manifest-driven:** `get_api` reads `api-reference.ts`, which is generated from each package\'s `manifest.ts`. The marker-pair protocol (`<gen-docs:api-reference:start @pyreon/<name>>`) lets some packages be generated and others stay hand-written during incremental migration.
