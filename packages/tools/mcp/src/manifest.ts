import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/mcp',
  title: 'MCP Server',
  tagline:
    'Model Context Protocol server — discoverability map, live API lookup, validation, migration, anti-pattern catalog, changelog, test-environment audit',
  description:
    'MCP server (stdio transport) that exposes Pyreon\\\'s structured knowledge to AI coding assistants (Claude Code, Cursor, etc.). Thirteen tools: `mcp_overview` (start here — markdown table of every tool with "when to use" + example, read straight from this manifest), `get_api` (look up any Pyreon API), `validate` (catch React + Pyreon-specific anti-patterns in a snippet), `migrate_react` (auto-convert React code), `diagnose` (parse a Pyreon error into structured fix info; optional `componentSource` + `reactiveTrace` for causal diagnosis), `get_routes` / `get_components` (project introspection), `get_browser_smoke_status` (which packages need a browser smoke test), `get_pattern` (canonical "how do I do X" docs), `get_anti_patterns` (the catalog from `.claude/rules/anti-patterns.md`), `get_changelog` (recent release notes per package), `audit_test_environment` (mock-vnode test scanner — PR #197 bug class), and `audit_islands` (project-wide islands cross-file audit — duplicate names, dead islands, registry drift, nested islands, never-with-registry).',
  category: 'server',
  features: [
    'Thirteen tools covering discovery, lookup, validation, migration, diagnosis, introspection, audit',
    'stdio transport — drop-in compatible with every MCP client',
    'Project context cached per server instance, auto-invalidates on cwd change',
    'Manifest-driven — `get_api` reads `api-reference.ts`, regenerated from package manifests',
    'AST-based detectors — `validate` catches React + Pyreon-specific patterns statically',
    'Real-repo audit tools (`audit_test_environment`, `audit_islands`, `get_browser_smoke_status`) walk packages/',
  ],
  longExample: `// .mcp/config.json — register the server with any MCP-aware client
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
//     → project-wide islands audit (5 cross-file foot-guns)`,
  api: [
    {
      name: 'mcp_overview',
      kind: 'constant',
      signature: 'tool: mcp_overview() → MarkdownTable',
      summary:
        'Returns a markdown table of every registered MCP tool with a one-sentence "when to use" description and a one-line example. Reads from this same manifest at runtime — single source of truth (the same data feeds `api-reference.ts`, `llms-full.txt`, and `docs/docs/mcp.md`). Intended as the first call for any AI agent connecting to the server: enumerates the surface so the agent can navigate by intent (e.g. "I need release notes" → `get_changelog`) rather than guessing tool names from `tools/list`.',
      example: `mcp_overview()
// → | Tool | When to use | Example |
//   |------|-------------|---------|
//   | mcp_overview | Returns a markdown table of every registered MCP tool... | mcp_overview() |
//   | get_api | Look up any Pyreon API by package and symbol... | get_api({ package: 'flow', symbol: 'createFlow' }) |
//   | ...`,
      mistakes: [
        'Skipping this tool and calling `tools/list` instead — that returns names + parameter schemas but no "when to use" guidance, so an agent has to call multiple tools to figure out which one fits the task.',
      ],
      seeAlso: ['get_api'],
    },
    {
      name: 'get_browser_smoke_status',
      kind: 'constant',
      signature: 'tool: get_browser_smoke_status — no args',
      summary:
        "Companion to the `pyreon/require-browser-smoke-test` lint rule. Reports which browser-categorized Pyreon packages have at least one `*.browser.test.{ts,tsx}` file under `src/`. Uses the same `.claude/rules/browser-packages.json` single source of truth as the rule + the CI script. Lets an AI agent check coverage before writing a new browser package (so it adds a smoke test in the same PR) instead of discovering the failure when CI runs. Falls back with a clear message if the JSON isn't present (e.g. consumer apps that don't ship the Pyreon monorepo layout).",
      example: `// Ask the MCP server:
//   "which Pyreon packages are missing browser smoke coverage?"
// Tool walks packages/, matches against .claude/rules/browser-packages.json,
// returns a coverage report.`,
      mistakes: [
        "Using the tool's output as a substitute for running the CI script — this tool only checks file existence, not the self-expiring-exemption check that `bun run lint:browser-smoke` performs",
      ],
      seeAlso: ['audit_test_environment'],
    },
    {
      name: 'get_api',
      kind: 'constant',
      signature: 'tool: get_api({ package: string; symbol: string }) → APIEntry',
      summary:
        'Look up any Pyreon API by `package` (e.g. `"flow"` or `"@pyreon/flow"`) and `symbol` (e.g. `"createFlow"`). Returns the canonical signature, example, foot-gun catalogue, and cross-references — drawn from `api-reference.ts`, which is regenerated from each package\\\'s `manifest.ts`. The single agent-facing entry point for "what does this API do and how do I avoid the common mistakes."',
      example: `// Agent-side
get_api({ package: 'flow', symbol: 'createFlow' })
get_api({ package: '@pyreon/router', symbol: 'useTypedSearchParams' })`,
      seeAlso: ['validate', 'get_pattern'],
    },
    {
      name: 'validate',
      kind: 'constant',
      signature: 'tool: validate({ code: string; filename?: string }) → Diagnostics[]',
      summary:
        'Two AST-based detectors run in parallel: `detectReactPatterns` flags "coming from React" mistakes (`useState`, `useEffect`, `className`, `onChange` on inputs, React-package imports), and `detectPyreonPatterns` flags "using Pyreon wrong" mistakes (`<For>` missing `by`, props destructured at component signature, `typeof process` dev gates, raw `addEventListener`, `Date.now() + Math.random()` IDs). Diagnostics are merged + sorted by line / column for top-down reading.',
      example: `validate({ code: \`
function MyComp(props) {
  const { value } = props          // → props-destructured
  return <For each={items}>{...}</For>  // → for-missing-by
}
\` })`,
      seeAlso: ['get_anti_patterns', 'migrate_react'],
    },
    {
      name: 'migrate_react',
      kind: 'constant',
      signature: 'tool: migrate_react({ code: string; filename?: string }) → MigrationResult',
      summary:
        'Convert React code to idiomatic Pyreon. Handles `useState` → `signal()`, `useEffect` → `effect()`, `className` → `class`, `onChange` → `onInput`, `useMemo` → `computed()`, React imports → Pyreon imports. Reports per-edit fixable diagnostics so callers can apply or review.',
      example: `migrate_react({ code: \`
import { useState, useEffect } from 'react'
function Counter() {
  const [count, setCount] = useState(0)
  useEffect(() => { console.log(count) }, [count])
  return <button onClick={() => setCount(count + 1)}>{count}</button>
}
\` })`,
      seeAlso: ['validate'],
    },
    {
      name: 'diagnose',
      kind: 'constant',
      signature:
        'tool: diagnose({ error: string, componentSource?: string, reactiveTrace?: ReactiveTraceEntry[], filename?: string, phase?: string }) → DiagnoseResult',
      summary:
        'Parse a Pyreon runtime / build error into structured fix information. **String-only call is unchanged** (probable cause + fix + related docs from the regex pattern table — fully backward-compatible). v2 adds OPTIONAL structured context for richer, causal diagnosis: pass `componentSource` and the tool runs the static Pyreon detectors over it and maps each hit to the documented anti-pattern catalog entry (the `detectorCodes` bridge); pass `reactiveTrace` (the `ErrorContext.reactiveTrace` from `@pyreon/core`, populated in dev) and the tool formats the causal sequence of signal writes leading to the crash. The tool is deterministic — it assembles structured context, the calling agent reasons over it (no embedded LLM). Use the enriched form when you have the failing component + the error report; use the bare string form for a quick "what does this error mean".',
      example: `// v1 — unchanged, backward-compatible
diagnose({ error: 'Cannot redefine property X on object [object Object]' })
// → cause: configurable: false on a getter; fix: set configurable: true

// v2 — structured context → causal diagnosis
diagnose({
  error: 'name is stale after parent update',
  componentSource: 'function G({ name }) { return <div>{name}</div> }',
  reactiveTrace: [{ name: 'name', prev: '"a"', next: '"b"', timestamp: 1 }],
})
// → base diagnosis + "Static detector findings: props-destructured"
//   + matched anti-pattern entry + the reactive run-up`,
      mistakes: [
        'Assuming v2 changed the string-only behaviour — it did not; an error-only call returns byte-identical output to before. The enrichment sections appear ONLY when componentSource / reactiveTrace are supplied',
        'Expecting the tool to return a fix patch — it returns structured CONTEXT (regex diagnosis + detector hits + matched anti-patterns + reactive run-up). The agent reasons over it; the tool does not embed a model',
        'Passing a production error report and expecting `reactiveTrace` content — the trace is dev-only (it tree-shakes out of prod builds), so prod reports carry `reactiveTrace: undefined` and the tool degrades to the v1 base diagnosis',
      ],
      seeAlso: ['validate', 'get_anti_patterns'],
    },
    {
      name: 'get_routes',
      kind: 'constant',
      signature: 'tool: get_routes() → Route[]',
      summary:
        'List every route in the current project — path, loader presence, guards, params, and named-route name. Walks the project source from `process.cwd()` down. Cached per server instance with auto-invalidation on `cwd` change.',
      example: `get_routes()
// → [{ path: '/', name: 'home', hasLoader: true, params: [] }, ...]`,
      seeAlso: ['get_components'],
    },
    {
      name: 'get_components',
      kind: 'constant',
      signature: 'tool: get_components() → ComponentInfo[]',
      summary:
        'List every component in the current project with its props and signal usage. Same scanner as `get_routes`. Useful for an agent before generating new code that needs to reference existing components.',
      example: `get_components()
// → [{ name: 'Button', file: 'src/Button.tsx', props: ['onClick', 'children'], signals: ['count'] }, ...]`,
      seeAlso: ['get_routes'],
    },
    {
      name: 'get_pattern',
      kind: 'constant',
      signature: 'tool: get_pattern({ name?: string }) → PatternBody | string[]',
      summary:
        'Fetch a canonical "how do I do X" pattern body from `docs/patterns/`. 16 foundational patterns ship: `controllable-state`, `data-fetching`, `dev-warnings`, `dynamic-fields`, `event-listeners`, `form-fields`, `imperative-toasts`, `islands`, `keyed-lists`, `reactive-context`, `reactive-spread`, `routing-setup`, `signal-writes`, `ssr-safe-hooks`, `state-management`, `styler-theming`. Omit `name` to list available patterns. Drop a new `docs/patterns/<slug>.md` file to add one — picked up on next call.',
      example: `get_pattern({ name: 'controllable-state' })
// → full canonical pattern body
get_pattern({})
// → [{ name: 'controllable-state', summary: '...' }, ...]`,
      seeAlso: ['get_anti_patterns'],
    },
    {
      name: 'get_anti_patterns',
      kind: 'constant',
      signature:
        "tool: get_anti_patterns({ category?: 'reactivity'|'jsx'|'context'|'architecture'|'testing'|'lifecycle'|'documentation'|'all'; name?: string; full?: boolean }) → string",
      summary:
        'Browse the anti-patterns catalog from `.claude/rules/anti-patterns.md`, token-frugal by default. **No args → a COMPACT INDEX** (one line per entry: title + `[detector: <code>]` tag + one-sentence hook; ≈3.3K tokens vs the ≈14K full dump — a ~76% cut on the common orient call). Drill in deliberately: `{ name }` → the single matching entry\\\'s full body (cheapest); `{ category }` → full bodies for one category; `{ full: true }` → entire catalog (≈14K, explicit opt-in). The index keeps per-category `## <Heading>` markers so categories are still discoverable in one call; each `[detector: <code>]` tag pairs the entry with the live `validate` detector.',
      example: `get_anti_patterns()
// → compact index (~3.3K): titles + detector tags + one-line hooks
get_anti_patterns({ name: 'Destructuring props' })  // → that entry's full body
get_anti_patterns({ category: 'reactivity' })       // → full bodies, one category
get_anti_patterns({ full: true })                   // → entire catalog (~14K)`,
      mistakes: [
        'Reaching for `{ full: true }` to "see the anti-patterns" — that is the ~14K dump. The no-arg index is the orient call; pull full bodies with `{ name }` once you know which entry matters',
        'Expecting no-arg to return full bodies — it returns the index (behaviour changed in the token-slim PR). Full bodies need `{ name }`, `{ category }`, or `{ full: true }`',
      ],
      seeAlso: ['validate', 'get_pattern'],
    },
    {
      name: 'get_changelog',
      kind: 'constant',
      signature:
        'tool: get_changelog({ package?: string; limit?: number; includeDependencyUpdates?: boolean; since?: string }) → ChangelogEntry[]',
      summary:
        'Recent release notes for any `@pyreon/*` package without scraping `git log`. Parses `packages/**/CHANGELOG.md` into version entries (`{ version, changes[], dependencyUpdates[], empty }`) and returns the N most recent substantive versions (default 5). Filters out ceremonial version bumps (pure dependency-update releases with no user-facing body) by default — opt back in with `includeDependencyUpdates: true`. `since: "0.12.0"` returns the delta from a known floor — useful when an agent knows the version it was trained against.',
      example: `get_changelog({ package: 'flow', limit: 5 })
get_changelog({ package: '@pyreon/router', since: '0.12.0' })`,
      seeAlso: ['get_api'],
    },
    {
      name: 'audit_test_environment',
      kind: 'constant',
      signature:
        "tool: audit_test_environment({ minRisk?: 'high' | 'medium' | 'low'; limit?: number }) → AuditReport",
      summary:
        'Scan every `*.test.{ts,tsx}` under `packages/` for the mock-vnode anti-pattern that caused PR #197\\\'s silent metadata drop. Files are classified HIGH / MEDIUM / LOW based on the balance of mock-vnode literals + helpers + helper-call sites vs real `h()` calls + `@pyreon/core` import. Three context-aware skips (helper-def vs binding discrimination, type-guard call-arg skip, template-string fixture mask) keep the false-positive rate low. Run before merging a new test file or after a framework change.',
      example: `audit_test_environment({ minRisk: 'medium', limit: 10 })
// → grouped report with HIGH / MEDIUM / LOW sections`,
      seeAlso: ['get_browser_smoke_status', 'audit_islands'],
    },
    {
      name: 'audit_islands',
      kind: 'constant',
      signature: 'tool: audit_islands({ json?: boolean }) → IslandAuditReport',
      summary:
        'Project-wide cross-file islands audit (PR C of the islands DX roadmap). Walks `packages/` + `examples/` and runs five detectors that auto-registry can\\\'t reach (manual `hydrateIslands({...})` for non-Vite consumers / library authors) AND PR G\\\'s per-file `island-never-with-registry-entry` detector misses (it only catches the same-file shape): `duplicate-name`, `never-with-registry-entry`, `registry-mismatch`, `nested-island`, `dead-island`. Each finding ships with file path + line/column + actionable fix suggestion. Companion to the `pyreon doctor --check-islands` CLI flag (same scanner, same five detectors). Run before merging an island PR; CI gate by piping `--json` and grepping `findings.length > 0`.',
      example: `audit_islands({})
// → markdown-grouped report with one section per finding code

audit_islands({ json: true })
// → machine-readable { root, findings: [...], summary: {...} }`,
      seeAlso: ['audit_test_environment', 'get_anti_patterns'],
    },
  ],
  gotchas: [
    {
      label: 'Project-context caching',
      note:
        'Each `createServer()` instance maintains its own cached context (routes, components, islands). The cache auto-resets when `process.cwd()` changes between tool invocations, so the same server can operate across multiple projects in one session.',
    },
    {
      label: 'Manifest-driven',
      note:
        '`get_api` reads `api-reference.ts`, which is generated from each package\\\'s `manifest.ts`. The marker-pair protocol (`<gen-docs:api-reference:start @pyreon/<name>>`) lets some packages be generated and others stay hand-written during incremental migration.',
    },
  ],
})
