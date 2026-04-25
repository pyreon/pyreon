import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/mcp',
  title: 'MCP Server',
  tagline:
    'Model Context Protocol server — live API lookup, validation, migration, anti-pattern catalog, changelog, test-environment audit',
  description:
    'MCP server (stdio transport) that exposes Pyreon\\\'s structured knowledge to AI coding assistants (Claude Code, Cursor, etc.). Eleven tools: `get_api` (look up any Pyreon API), `validate` (catch React + Pyreon-specific anti-patterns in a snippet), `migrate_react` (auto-convert React code), `diagnose` (parse a Pyreon error into structured fix info), `get_routes` / `get_components` (project introspection), `get_browser_smoke_status` (which packages need a browser smoke test), `get_pattern` (canonical "how do I do X" docs), `get_anti_patterns` (the catalog from `.claude/rules/anti-patterns.md`), `get_changelog` (recent release notes per package), and `audit_test_environment` (mock-vnode test scanner — PR #197 bug class).',
  category: 'server',
  features: [
    'Eleven tools covering lookup, validation, migration, diagnosis, introspection, audit',
    'stdio transport — drop-in compatible with every MCP client',
    'Project context cached per server instance, auto-invalidates on cwd change',
    'Manifest-driven — `get_api` reads `api-reference.ts`, regenerated from package manifests',
    'AST-based detectors — `validate` catches React + Pyreon-specific patterns statically',
    'Real-repo audit tools (`audit_test_environment`, `get_browser_smoke_status`) walk packages/',
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
//     → mock-vnode test files ranked HIGH / MEDIUM / LOW`,
  api: [
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
      signature: 'tool: diagnose({ error: string }) → DiagnoseResult',
      summary:
        'Parse a Pyreon runtime / build error message into structured fix information: probable cause, recommended fix, related docs, and the `.claude/rules/anti-patterns.md` entry (if any) the error matches. Useful when an agent sees a stack trace and wants to skip the "search the codebase for similar errors" step.',
      example: `diagnose({ error: 'Cannot redefine property X on object [object Object]' })
// → cause: configurable: false on a getter; fix: set configurable: true`,
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
        'Fetch a canonical "how do I do X" pattern body from `docs/patterns/`. Eight foundational patterns ship: `dev-warnings`, `controllable-state`, `ssr-safe-hooks`, `signal-writes`, `keyed-lists`, `reactive-context`, `event-listeners`, `form-fields`. Omit `name` to list available patterns. Drop a new `docs/patterns/<slug>.md` file to add one — picked up on next call.',
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
        "tool: get_anti_patterns({ category?: 'reactivity' | 'jsx' | 'context' | 'architecture' | 'testing' | 'lifecycle' | 'documentation' | 'all' }) → AntiPattern[]",
      summary:
        'Browse the anti-patterns catalog parsed from `.claude/rules/anti-patterns.md`. Each entry surfaces its `[detector: <code>]` tag inline so an agent can pair the catalog entry with the live static detector exposed by `validate`. Optional `category` filter; default returns all categories.',
      example: `get_anti_patterns({ category: 'reactivity' })
// → ['Bare signal in JSX text', 'Stale closures', 'Destructuring props', ...]`,
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
      seeAlso: ['get_browser_smoke_status'],
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
