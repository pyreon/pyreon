# Pyreon — agent instructions

Pyreon is a full-stack UI framework built on fine-grained reactivity (signals): SPA, SSR, SSG, ISR and islands on the web, plus a compiler (PMTC) that lowers the same source to SwiftUI and Jetpack Compose. Every package is published under `@pyreon/*`.

This file is the entry point for any coding agent (Claude Code, Codex, Cursor, Copilot, Gemini, Aider, …) and for human contributors. It holds the rules that apply to almost every change. Everything situational lives in `.agents/` and is read on demand — see [Where to read more](#where-to-read-more).

The bar is "do it properly, not quickly". When priorities across open work are unclear, ask the maintainer.

## Commands

| Task | Command |
| --- | --- |
| Install (also builds every package's `lib/`) | `bun install` |
| Rebuild a stale `lib/` | `bun scripts/bootstrap.ts` |
| All unit tests / one package | `bun run test` / `bun run --filter='@pyreon/<pkg>' test` |
| Real-Chromium tests | `bun run test:browser` |
| E2E | `bun run test:e2e` (per-suite scripts in `package.json`) |
| Lint / format | `bun run lint` (oxlint) · `bun run lint:pyreon` (Pyreon's own rules) · `bun run format` |
| Typecheck | `bun run typecheck` |
| Cheap pre-push gates | `bun run validate-fast` |
| Regenerate docs from manifests | `bun run gen-docs && bun docs/scripts/gen-all.ts` |
| Changeset | `bun changeset` |

Use `bun run test`, never `bun test` (the suites are vitest). Run `bun run validate-fast` before every push; the `.githooks/pre-push` hook runs it plus affected typecheck and tests.

## Where to read more

Read the matching file **before** working in its area, and prefer it over memory — stating a benchmark number, a package contract or a native capability from memory is how stale claims ship.

| Read | Before |
| --- | --- |
| `.agents/rules/anti-patterns.md` | touching the compiler, SSR, mount/hydration, or adding a module-level cache, stack or registry. Large: query it through the MCP `get_anti_patterns` tool or grep for the topic. |
| `.agents/rules/workflow.md` | opening a PR, restacking, or triaging a red CI gate (known failure modes and their fixes) |
| `.agents/rules/testing.md` · `.agents/rules/test-environment-parity.md` | writing or changing tests |
| `.agents/rules/code-style.md` | lint configuration, UI component and primitive conventions |
| `.agents/rules/architecture.md` | workspace layout, bootstrap, performance invariants |
| `.agents/guides/internals/` | `packages/core/{compiler,reactivity,runtime-dom,runtime-server}`, JSX lowering, batching, SSR, HMR, Plain Mode |
| `.agents/guides/fundamentals/` | any `packages/fundamentals/*` package (router per-package files under `references/`) |
| `.agents/guides/ui-system/` | `packages/ui-system/**`, `packages/ui/**` |
| `.agents/guides/multiplatform/` | `packages/native/**`, `@pyreon/primitives`, iOS/Android work |
| `.agents/guides/zero/` | `packages/zero/**`, render modes, deploy adapters, dev TLS |
| `.agents/guides/tools/` | atlas, lathe, loom, `@pyreon/testing`, the `pyreon` CLI and `doctor` |
| `.agents/guides/ci/` | workflows, jobs, required checks, caches, the full gate reference |
| `.agents/guides/benchmarks/` | making, changing or reviewing any performance claim, or running a bench |

### The Pyreon MCP server

The repo ships its own MCP server (`@pyreon/mcp`), which exposes 21 tools: `get_anti_patterns` (a token-budgeted index over the anti-pattern catalog), `validate` (static detectors for Pyreon and React-habit mistakes), `diagnose`, `explain_error`, `explain_reactivity`, `get_api`, `get_pattern`, `audit_test_environment`, `audit_islands` and more. Prefer them over grepping large files.

Project configs register it for the common tools: `.mcp.json` (Claude Code; approve the server once), `.vscode/mcp.json` (VS Code / Copilot), `.cursor/mcp.json` (Cursor) and `.gemini/settings.json` (Gemini CLI, which also points Gemini at this file). Any other MCP client: run `node packages/tools/mcp/lib/index.js` over stdio from the repo root. The server runs from `lib/`, which `bun install` builds.

## Packages

76 published packages across 6 categories under `packages/`, plus private support packages:

- `packages/core/` (10): reactivity, core, compiler, runtime-dom, runtime-server, router, head, server, primitives, sized-map
- `packages/fundamentals/` (27): a11y, store, state-tree, form, validation, validate, http, query, table, virtual, i18n, feature, charts, storage, hooks, hotkeys, permissions, machine, flow, code, rich-text, document, rx, toast, url-state, dnd, sync
- `packages/tools/` (15 published): cli, config, lint, mcp, vite-plugin, typescript, storybook, atlas, loom, lathe, and the compat layers react-/preact-/vue-/solid-/svelte-compat; `devtools` is private
- `packages/ui-system/` (11): ui-core, styler, unistyle, elements, attrs, rocketstyle, coolgrid, kinetic, kinetic-presets, connector-document, document-primitives
- `packages/zero/` (6): zero, zero-cli, create-zero, create-multiplatform, meta, zero-content
- `packages/native/` (6): native-compiler, native-cli, and the Swift/Kotlin runtime and router packages. The four runtime/router packages ship SOURCE (consumed by SwiftPM and Gradle from `node_modules`).
- `packages/internals/` (private): test-utils, manifest, perf-harness, ansi, vitest-config, playwright-config, tsconfig
- `packages/ui/` (private): ui-theme, ui-components, ui-primitives

Plus `docs/` (the docs site, built on `@pyreon/zero` — 211 doc pages covering all packages) and `examples/`.

Notable package facts:

- `@pyreon/lint` — Pyreon-specific linter — 132 rules, 25 categories, with config files, watch mode, an AST cache and an LSP server.
- `@pyreon/compiler` — JSX transform with a Rust (napi-rs) backend and a JS fallback that must stay byte-identical (`native-equivalence.test.ts`, `fuzz-equivalence.test.ts`). Any emit change lands in both backends in one PR.
- `@pyreon/test-utils` (private, framework-internal) is not `@pyreon/testing` (the public Testing-Library-style kit).

Layer order: reactivity → core → {compiler, runtime-dom, runtime-server, router, head} → server → vite-plugin → compat. UI: styler → ui-core → unistyle → {attrs, rocketstyle, elements, coolgrid} → kinetic. The UI graph is acyclic; `unistyle` registers its theme engine into `ui-core` at load time (`theme-engine.ts`), and `ui-core` falls back to an identity engine when unistyle is absent.

### Documentation is generated from manifests

Each package's `src/manifest.ts` feeds `llms.txt`, `llms-full.txt`, the MCP API reference (`packages/tools/mcp/src/api-reference.ts`) and the docs-site reference pages. Edit the manifest, never a generated file, then run both generators (`bun run gen-docs && bun docs/scripts/gen-all.ts`).

- Coverage: 57 of 76 published packages have a manifest. The remaining 19 are EXPLICITLY EXEMPT build tooling or scaffolding with no consumable runtime API; the list is `NO_MANIFEST_EXEMPT` in `scripts/check-multiplatform-tier.ts`. Do not give them filler manifests.
- Every manifest declares `multiplatform: { tier: 'shared' | 'service-backend' | 'web-only', rationale }` (rationale required for `web-only`).
- MCP `validate` runs `detectReactPatterns` plus `detectPyreonPatterns`, which catches "using Pyreon wrong" mistakes — 19 detector codes today.

## Core rules of the framework

### Workspace resolution

Each `package.json` exports `"bun": "./src/index.ts"` and the root tsconfig sets `customConditions: ["bun"]`, so tests and typecheck read source. Vite's config bundler uses the `node` condition, which points at `lib/`. `bun install` builds every package whose source changed (content-hashed in `.bootstrap-cache.json`). If an example build fails with `MISSING_EXPORT` or missing files after a source edit, run `bun scripts/bootstrap.ts`. A running dev server does not see edits to `@pyreon/vite-plugin` or `@pyreon/zero` until their `lib/` is rebuilt.

### Components run once

What is reactive depends on where a signal is read:

- **Component props that read a signal** are reactive: the compiler wraps them in `_rp()`, which becomes a getter on `props`. Read them inside an effect, computed or JSX accessor.
- **Children** `{props.x}` of a component, and DOM text children that read signals, are reactive (the compiler emits an accessor). `{() => …}` is always reactive.
- **Destructuring props** (`const { x } = props`, or a destructured parameter) captures the value once. Use `props.x`, or `splitProps`.
- **`const` derived from props** is inlined at JSX use sites and stays reactive; `let`/`var` from props do not.
- **Spread**: `<Comp {...rest}>` and `<div {...rest}>` both preserve reactivity. Hand-written `Object.assign` or `{ ...source }` does not — use `mergeProps`/`splitProps`, or copy property DESCRIPTORS with `Object.getOwnPropertyDescriptors` + `defineProperty` (`configurable: true`).
- **Early returns** in a component body run once. `if (loading()) return <Skeleton/>` pins the component to that branch; use `<Show>` or return an accessor.

### JSX and context

- `jsxImportSource: "@pyreon/core"`. Use `class` and `for`, not `className`/`htmlFor`; `onInput` for per-keystroke updates.
- `<For each={items} by={(r) => r.id}>` — the key prop is `by`, not `key`.
- `signal.set(v)` / `.update(fn)` write; calling `signal(v)` only reads.
- `<Show when>` / `<Match when>` accept a value or an accessor; a reactive condition needs the accessor, `when={() => sig()}`.
- `createContext<T>()` returns `T` from `useContext`; `createReactiveContext<T>()` returns `() => T` for values that change (theme, locale). Context is owner-based on the client (`provide()` writes to the current component's scope) and request-scoped on the server.
- Compat apps (`@pyreon/*-compat`) wrap every component; a Pyreon-style helper that calls `provide`/`onMount`/`effect` in its body must be marked with `nativeCompat(Component)`.
- Import `island` from `@pyreon/server/client`, never the `@pyreon/server` barrel, in any code that reaches the client.

### Library code

- Dev-only warnings use the bare gate `process.env.NODE_ENV !== 'production'` — not `typeof process`, not `import.meta.env.DEV`, and never through a local `__DEV__` const (bundlers do not fold through the alias). Enforced by `pyreon/no-process-dev-gate`. Server-only packages are exempt.
- Error messages start with `[Pyreon]` and say how to fix the problem.
- `exactOptionalPropertyTypes` is on: optional properties assigned a possibly-undefined value need an explicit `| undefined`.
- A `node:*` import must never be reachable from a client-safe entry — not even through a lazy `import()`. Put server-only code behind a server-only module or subpath.
- Pyreon ships ESM only: no published package declares a `require` or `default` export condition (`check-esm-only`; only `@pyreon/storybook` is exempt, because Storybook loads presets through CJS).
- Browser-running packages need a real-Chromium smoke test (`*.browser.test.tsx`, listed in `.agents/rules/browser-packages.json`).

### Memory-leak classes

Before adding any module-level cache, stack or registry, answer: what evicts entries, what the cleanup contract is (LIFO, identity, refcount), and which test exercises the cleanup. "The GC will handle it" counts as a leak. Full catalog with fixes: the "Memory Leak Classes" section of `.agents/rules/anti-patterns.md`.

| Class | Shape | Fix |
| --- | --- | --- |
| A | `push` at setup, `pop()` at cleanup on a shared stack; out-of-order removal pops the wrong frame | remove by identity: `splice(lastIndexOf(frame), 1)` |
| C | unbounded module-level cache | LRU bound, subscriber-aware sweep, or lifecycle invalidation |
| D | shared listener registered without refcount or idempotency | refcount, or return the cached cleanup |
| F | a slow stale promise overwrites a newer result | version counter; clear promise caches on both settle paths |
| H | a closure retains a whole snapshot for an effect's lifetime | capture only the id or key you need |
| I | `Promise.race` with a `setTimeout` that is never cleared | keep the timer id and `clearTimeout` in `finally` |

## Tests

- Vitest with globals; DOM packages use `happy-dom`. Every vitest config uses `defineNodeConfig`/`defineBrowserConfig` from `@pyreon/vitest-config`; Playwright configs use `definePlaywrightConfig`.
- happy-dom is not a browser. Layout, pointer sequencing, SVG namespaces, CSS shorthand resets and real hydration need a `*.browser.test.tsx` or an e2e spec.
- A mock-vnode test needs a parallel test through the real `h()`.
- A compiled-template bug is only reproducible through the real compiler (`transformJSX`); vitest's own JSX transform does not emit `_tpl`.
- **Bisect-verify every regression test**: revert the fix, confirm the test fails with the expected error, restore, confirm it passes, and record that in the PR description. A test that passes against the broken code proves nothing.

## Workflow

- **Fix the class, not the instance.** Before fixing, reproduce. Ask whether the shape you reproduced is the whole class of failing inputs; fix at the layer where the class collapses to one rule. Fix bugs you find along the way, or open the follow-up PR immediately.
- **Report honestly.** Lead a summary with what is not done and what was not verified. A measured tie or loss is reported as a tie or loss.
- **Keep knowledge current in the same PR.** A new anti-pattern goes into `.agents/rules/anti-patterns.md`; a new convention into the matching rule file; an API change into the manifest, README and docs. Put durable contracts in these files, not per-PR narrative — history belongs in git and changelogs.
- **Changesets**: any source change in a published package needs `bun changeset`. Pyreon is 0.x, so a breaking change is `minor`, never `major`.

### Git

- Never push to `main`. Work on a branch in a worktree created from `origin/main` (`git worktree add /tmp/wt-<name> origin/main -b <branch>`); do not check out or pull in the primary checkout.
- Every PR targets `main`. Never base a PR on another feature branch: it merges without the required checks.
- Stage specific files, never `git add .`. After a `package.json` change run `bun install` and commit `bun.lock`.
- **Never merge a PR.** Open it, report the URL and stop. Merge only when the maintainer says "merge it" for that PR.
- **No AI attribution anywhere**: no `Co-Authored-By:` trailer naming an AI, and no "Generated with …" footer in a commit, PR body or changeset — even if your tool adds one by default. Human co-authors are fine.
- Backticks inside a double-quoted `-m` / `--body` argument are shell command substitution and silently vanish. Write the message to a file and pass `-F` / `--body-file`.
- A PR with far fewer checks than usual is usually CONFLICTING (GitHub dispatches nothing for it): check `gh pr view N --json mergeable`.
