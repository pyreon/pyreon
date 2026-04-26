# @pyreon/mcp

## 0.14.0

### Minor Changes

- [#311](https://github.com/pyreon/pyreon/pull/311) [`602446b`](https://github.com/pyreon/pyreon/commit/602446bb49e6ea95fe9d2dbc7774bbf9a66da80d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Test-environment audit (T2.5.7) — scans every `*.test.ts(x)` under `packages/` for mock-vnode patterns (the PR [#197](https://github.com/pyreon/pyreon/issues/197) bug class: tests that construct `{ type, props, children }` literals or a custom `vnode()` helper instead of going through the real `h()` from `@pyreon/core`). Classifies each file as HIGH / MEDIUM / LOW based on the balance of mock literals, helper definitions, helper call-sites, real `h()` calls, and the `@pyreon/core` import.

  Scanner lives in `@pyreon/compiler` (`auditTestEnvironment`, `formatTestAudit`) so both `@pyreon/mcp` and `@pyreon/cli` can use it without pulling in each other.

  - **MCP**: new `audit_test_environment` tool. Options `minRisk` (default `medium`) and `limit` (default 20). Scans 400+ test files in ~50ms.
  - **CLI**: `pyreon doctor --audit-tests` appends the audit output. `--audit-min-risk high|medium|low` to filter. Honors `--json` for machine-readable output.

- [#310](https://github.com/pyreon/pyreon/pull/310) [`94c63f9`](https://github.com/pyreon/pyreon/commit/94c63f9426ef0ce64ad8883dd571fd87b0401f88) Thanks [@vitbokisch](https://github.com/vitbokisch)! - New MCP `get_changelog` tool (T2.5.8). AI agents can fetch recent release notes for any `@pyreon/*` package without scraping `git log` or reading raw markdown. Parses changesets-populated `CHANGELOG.md` files, filters out ceremonial version bumps (pure dependency-update releases), and returns the N most recent substantive versions. Accepts the short slug (`"query"`) or the fully-qualified name (`"@pyreon/query"`). Options: `limit` (default 5), `includeDependencyUpdates` (default false), and `since` (filter to versions strictly newer than a floor — useful when an agent knows the version it was trained against and wants just the delta). Complements the existing `get_pattern` + `get_anti_patterns` proactive-docs trio — `get_changelog` answers "what changed recently" while `get_api` answers "what is it now".

- [#309](https://github.com/pyreon/pyreon/pull/309) [`7313617`](https://github.com/pyreon/pyreon/commit/731361719e4ab6fb29bd13265802b36382149a7c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Two new MCP tools for AI coding assistants (T2.5.3 + T2.5.4). `get_pattern({ name })` fetches a "how do I do X in Pyreon" pattern body from `docs/patterns/<name>.md` — 8 foundational patterns ship today (dev-warnings, controllable-state, ssr-safe-hooks, signal-writes, keyed-lists, reactive-context, event-listeners, form-fields). `get_anti_patterns({ category? })` parses `.claude/rules/anti-patterns.md` and returns per-category listings with detector tags surfaced inline. Complements the reactive `validate` tool from T2.5.2: patterns + anti-patterns are proactive (called BEFORE writing code), `validate` is reactive (called AFTER). Both tools walk up from `process.cwd()` to locate the source files so they work across worktrees and monorepo layouts; a helpful miss message prints when running outside the Pyreon repo.

- [#307](https://github.com/pyreon/pyreon/pull/307) [`4638c27`](https://github.com/pyreon/pyreon/commit/4638c2761ec34b1102a36c4675cfcfa805c2168c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Pyreon-specific anti-pattern detector for the MCP `validate` tool (T2.5.2). `@pyreon/compiler` exports a new `detectPyreonPatterns(code, filename)` AST walker catching 9 "using Pyreon wrong" mistakes — `for-missing-by` / `for-with-key` on `<For>`, `props-destructured` at component signatures, `process-dev-gate` (dead code in Vite browser bundles), `empty-theme` no-op chains, `raw-add-event-listener` / `raw-remove-event-listener`, `date-math-random-id` ID schemes, and `on-click-undefined`. `@pyreon/mcp`'s `validate` tool now merges these diagnostics with the existing React detector output, sorted by source line. Every detected pattern is grounded in `.claude/rules/anti-patterns.md` — each bullet there carries a `[detector: <code>]` tag so contributors see what runs statically vs what remains doc-only.

### Patch Changes

- Updated dependencies [[`aa8e61b`](https://github.com/pyreon/pyreon/commit/aa8e61b873b7d42c60a613f57841a75293080c8a), [`602446b`](https://github.com/pyreon/pyreon/commit/602446bb49e6ea95fe9d2dbc7774bbf9a66da80d), [`4638c27`](https://github.com/pyreon/pyreon/commit/4638c2761ec34b1102a36c4675cfcfa805c2168c), [`83aa9ab`](https://github.com/pyreon/pyreon/commit/83aa9abbc52d423dfc9d45a3b0a4e048b161186d)]:
  - @pyreon/compiler@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.15

## 0.12.14

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.11

## 0.7.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.7.2

## 0.7.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.7.1

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.6.0

## 0.5.7

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.7

## 0.5.6

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.6

## 0.5.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.4

## 0.5.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.3

## 0.5.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.2

## 0.5.1

### Patch Changes

- Unify project scanner into @pyreon/compiler, fix JSX type declarations for published packages, update dependencies, and resolve build compatibility with rolldown 1.15.0.

- Updated dependencies []:
  - @pyreon/compiler@0.5.1

## 0.5.0

### Minor Changes

- ### New packages

  - `@pyreon/cli` — project doctor command that detects React patterns (className, htmlFor, React imports) and auto-fixes them for Pyreon
  - `@pyreon/mcp` — Model Context Protocol server providing AI tools with project context, API reference, and documentation

  ### Features

  - **JSX type narrowing** — added `JSX.Element`, `JSX.ElementType`, and `JSX.ElementChildrenAttribute` for full TypeScript JSX compatibility
  - **Callback refs** — `ref` prop now accepts `(el: Element) => void` in addition to `{ current }` objects
  - **React pattern interceptor** (`@pyreon/compiler`) — AST-based detection and migration of React patterns to Pyreon equivalents
  - **Vite plugin context generation** — automatically generates `pyreon-context.json` and `llms.txt` during dev/build
  - **MCP server tools** — `get-context`, `lookup-api`, `diagnose-error`, `suggest-migration` for AI-assisted development

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.0
