---
title: '@pyreon/cli'
description: Command-line tools for Pyreon — the doctor health audit (14 gates, 0-100 score) and the context generator for AI tools.
---

`@pyreon/cli` is the command-line companion for Pyreon projects. It ships five commands: **`pyreon doctor`** — a project-wide health audit that runs a battery of independent **gates** in parallel, aggregates every finding into a unified report, and computes a **0-100 health score** with a letter grade and a per-category bar chart; **`pyreon context`** — a project-structure scanner that writes a machine-readable summary for AI coding assistants; **`pyreon info`** — an environment report that lists every installed `@pyreon/*` version and flags version skew before it trips the duplicate-instance guard; **`pyreon upgrade`** — the fix for that skew, aligning every `@pyreon/*` dependency to one version; and **`pyreon lint`** — a thin front door to `@pyreon/lint` that forwards every `pyreon-lint` flag.

<PackageBadge name="@pyreon/cli" href="/docs/cli" />

## Installation

:::code-group

```bash [npm]
npm install -D @pyreon/cli
```

```bash [bun]
bun add -d @pyreon/cli
```

```bash [pnpm]
pnpm add -D @pyreon/cli
```

```bash [yarn]
yarn add -D @pyreon/cli
```

:::

The package installs a single `pyreon` binary. Run it through your package manager's runner without a global install:

:::code-group

```bash [npm]
npx pyreon doctor
```

```bash [bun]
bunx pyreon doctor
```

```bash [pnpm]
pnpm exec pyreon doctor
```

```bash [yarn]
yarn pyreon doctor
```

:::

`@pyreon/cli` declares `typescript` as a peer dependency (`>=5.0.0`) because the audit gates lean on TypeScript's compiler API for AST analysis. It works in any project — the gates that target Pyreon-specific surfaces (SSG conventions, islands, doc claims) skip gracefully when the project isn't a Pyreon repo.

## Why a doctor command?

Pyreon's quality gates have always existed as a sprawl of standalone scripts — `check-distribution`, `check-doc-claims`, `audit-types`, `audit-tests`, the islands/SSG/content auditors. Each prints its own format, exits its own way, and you have to remember to run all of them. `pyreon doctor` is the **single entry point**: one command runs every gate, isolates failures (a gate that throws never takes down the rest), and rolls the results into one scored report you can read at a glance — or pipe into CI, GitHub Actions, or an AI agent.

The output is modeled after [react.doctor](https://www.react.doctor/): a big score banner, per-category bars, and the top findings with actionable fixes inline.

```bash
pyreon doctor
```

```text
  pyreon doctor · project health audit

  Score:  92/100   Grade: A

  Per category:

  correctness    █████████░░░ 87  · 1E 1W
  performance    ████████████ 100 · clean
  architecture   ████████████ 100 · clean
  testing        ████████████ 100 · clean
  documentation  ████████████ 100 · clean
  best-practices clean (advisory — not graded)

  Top findings (2 of 2):

  ✗ useState imported from React. Use signal() from @pyreon/reactivity.  react-patterns/no-usestate
     src/App.tsx:1:9
     fix: import { signal } from "@pyreon/reactivity"

  ! className → class (HTML standard attribute).  react-patterns/className
     src/App.tsx:3:18

  1 error · 1 warning · 12 gates · 1.4s
```

By default `pyreon doctor` runs the **12 fast gates** (~2-5s on a warm cache). The 2 slow gates are opt-in via `--full`.

## `pyreon check`

A **fast, file-scoped** scan for Pyreon/React anti-patterns — the terminal-native twin of the MCP `validate` tool. It runs the compiler's two static detectors (`detectPyreonPatterns` for "using Pyreon wrong" footguns, `detectReactPatterns` for "from React" mistakes) over source files and prints each finding **with its inline fix**. It exits non-zero on any finding, so it doubles as a pre-commit / CI gate.

```bash
pyreon check                    # scan git-changed .ts/.tsx files (the pre-commit inner loop)
pyreon check src/              # scan a directory (recursive; skips node_modules/lib/dist)
pyreon check src/App.tsx        # scan specific files
pyreon check --fix              # apply the mechanically-safe auto-fixes in place
pyreon check --json             # machine-readable findings for tooling
```

Example output:

```
  src/Counter.tsx
    4:2  [signal-write-as-call] (auto-fixable — run with --fix)
      `count(value)` does NOT write the signal — use `count.set(value)` …
      → count.set(5)
    5:9  [for-missing-by]
      <For each={...}> requires a `by` prop so the keyed reconciler can preserve identity …
      → <For each={items} by={(item) => item.id}>

  2 findings in 1 file  ·  some are auto-fixable with --fix
```

**How it differs from the neighbours:** `pyreon doctor` is the whole-project health audit (all gates + a 0-100 score, slower); `pyreon lint` runs the `@pyreon/lint` **rule set** (a different engine). `pyreon check` is the fast, file-scoped **compiler-detector** pass — the quickest way to answer "did I introduce a Pyreon anti-pattern in this file / my diff?" `--fix` applies `migratePyreonCode` + `migrateReactCode` (only the mechanically-safe fixes; anything else stays reported so it still gates).
## `pyreon add`

Install one or more `@pyreon/*` packages **and print exactly how to wire each one in** — the root provider to add plus a usage snippet, tailored per package.

```bash
pyreon add query              # installs @pyreon/query (bare name → @pyreon/query)
pyreon add query toast i18n   # several at once
pyreon add @pyreon/form --dry-run   # show the plan + recipe without installing
pyreon add query --json       # machine-readable plan
```

It **auto-detects your package manager** from the lockfile (`bun.lock` → bun, `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, else npm), walking up from the current directory — so you don't have to remember which `add` command this project uses. Then it prints the setup:

```
  @pyreon/query — TanStack Query adapter …
  1. Add the provider near your app root:
      import { QueryClient, QueryClientProvider } from '@pyreon/query'
      const queryClient = new QueryClient()
      <QueryClientProvider client={queryClient}> <App /> </QueryClientProvider>
  2. Use it:
      const todos = useQuery(() => ({ queryKey: ['todos', id()], queryFn: fetchTodos }))
  Docs: https://pyreon.dev/docs/query
```

Curated recipes exist for the flagship packages (query, toast, i18n, permissions, form, store, router, head); any other `@pyreon/*` package still installs, with a generic docs pointer. The recipes live in the CLI itself (hand-authored + verified against each package's real API) rather than being generated from manifests — published packages don't ship their manifests, and reaching across packages for them would bloat the CLI's install.

## `pyreon new`

Scaffold a new Pyreon project — a single front door alongside the rest of the `pyreon` commands, instead of a separately-remembered `npm create @pyreon/zero`.

```bash
pyreon new my-app              # web / full-stack app (delegates to @pyreon/create-zero)
pyreon new my-app --native     # multiplatform (SwiftUI + Compose) via @pyreon/create-multiplatform
pyreon new my-app --template blog   # any other flag passes straight through
pyreon new my-app --dry-run    # print the npx command without running it
```

It's a thin, dependency-free delegator: it `npx`-runs the appropriate `create-*` scaffolder (which owns the interactive prompts and templates), pinned to `@latest` so a new project always starts on the freshest templates regardless of how old your globally-installed `@pyreon/cli` is. Your project name and any extra flags pass through untouched.

## `pyreon mcp`

Launch the Pyreon **MCP server** — the [Model Context Protocol](https://modelcontextprotocol.io) server (`@pyreon/mcp`) that serves Pyreon's API reference, pattern catalog, `validate`, `diagnose`, and changelog to AI coding assistants. A single front door alongside the other `pyreon` commands, instead of a separately-remembered package invocation.

```bash
pyreon mcp                 # launch the stdio MCP server (blocks; the client talks over stdin/stdout)
pyreon mcp --dry-run       # print the npx command without launching
pyreon mcp <args>          # any extra flags pass straight through to the server
```

It's a thin, dependency-free delegator: it `npx`-runs `@pyreon/mcp`. Unlike `pyreon new`, it is deliberately **not** pinned to `@latest` — `npx @pyreon/mcp` prefers the **project-local** `@pyreon/mcp` when it's installed, so the served API reference matches *your* installed Pyreon version, and only fetches it on demand when the project doesn't have it. It inherits stdio, so the AI client that spawned `pyreon mcp` communicates with the server directly.

Point your assistant's MCP config at `pyreon mcp` (e.g. as the `command`) to get Pyreon-aware `validate` / `get_api` / `get_pattern` / `diagnose` tools.

## `pyreon doctor`

### How it works

The orchestrator selects a gate set, runs every gate concurrently via `Promise.all`, and hands the results to the aggregator. The gates are fully independent — no shared state, no file-write contention (only `--fix` writes, and the writing gates target disjoint file patterns) — so running them in parallel cuts the fast set from ~5s sequential to ~1-2s wall-clock.

Each gate emits **findings** in a unified shape: a `category` (`correctness` / `performance` / `architecture` / `testing` / `documentation` / `best-practices`), a `severity` (`error` / `warning` / `info`), a stable `<gate>/<rule>` code, a human message, an optional source location, and an optional fix hint. The aggregator sorts findings (errors first, then by category, then by code), tallies totals, and computes the score.

:::note{title="Gate isolation"}
A gate that throws is caught and recorded as a single `<gate>/gate-failed` **error** finding rather than rejecting the whole run. You always get a complete report — a broken gate surfaces as one finding instead of swallowing the other eleven.
:::

### Scan scope — workspace roots

The file-scanning gates (`react-patterns`, `pyreon-patterns`, `lint`, `audit-tests`) resolve their scan scope from the workspace's **own configuration** — the root `package.json` `workspaces` globs or `pnpm-workspace.yaml` — discovered by walking up from the cwd. Multi-root layouts (`apps/* + packages/* + modules/*`) are fully covered, and results are identical from any directory in the repo; a repo with no workspaces is treated as a single package. Per package, `src/**` is scanned when present, always minus tests / fixtures / `.d.ts` (detector fixtures deliberately contain anti-patterns — scoring them would produce a false grade).

The report header shows what was scanned (`Scope: 4 package root(s) from workspaces (…)` plus per-gate file counts), and a gate that matches **no** files is skipped with a warning instead of reading as a clean pass — its category is "not measured" and never contributes a free 100. If nothing at all was measured, the score renders as `—` and `--ci` exits non-zero. Escape hatches: `--roots <glob,...>` overrides discovery for non-standard layouts, and `pyreon.doctor.excludeRoots` globs in the root package.json exclude demo/docs workspaces from grading.

### Gates

There are **14 gates** total: 12 fast (run by default) and 2 slow (opt in with `--full`).

| Gate | Speed | Category | What it checks |
| --- | --- | --- | --- |
| `react-patterns` | fast | `correctness` | "Coming from React" mistakes — `useState`, `useEffect`, `className`, `htmlFor`, `onChange` on inputs, `.value` writes, React-package imports. `*-compat` packages are excluded (exposing `useState`/`className` is their literal purpose). |
| `pyreon-patterns` | fast | `correctness` | "Using Pyreon wrong" mistakes — `<For>` missing `by`, destructured props, signal-write-as-call, and more (the `[detector: …]` anti-pattern codes). Codes a `@pyreon/lint` rule fully owns (`process-dev-gate`, `raw-add-event-listener`, `query-options-as-function`) are **deferred to the `lint` gate** so they aren't double-reported at the wrong severity. |
| `lint` | fast | by rule | Every configured `@pyreon/lint` rule across first-party source (reads your `.pyreonlintrc.json`). Each finding's category is derived from the rule — `performance` rules land in `performance`, `architecture`/`ssr`/`ssg`/`router`/`styling`/`accessibility` in `architecture`, the rest in `correctness`. Opt-in best-practice rules (`meta.optIn`) route to the advisory `best-practices` bucket. |
| `distribution` | fast | `architecture` | Published-package hygiene — every `@pyreon/*` package declares `sideEffects`, and its `files` array does NOT exclude `!lib/**/*.map` (source maps must ship so framework stack traces are readable). Includes a live `npm pack --dry-run` probe of `@pyreon/reactivity` confirming `.map` files land in the tarball. |
| `doc-claims` | fast | `documentation` | Hand-quoted numeric claims in docs match the source of truth — hook-export count, doc-page count, lint-rule count, lint-category count, detector-code count. Catches the drift where one claim site is bumped and the others aren't. |
| `islands-audit` | fast | `architecture` | Cross-file island detectors (same scanner as the MCP `audit_islands` tool): `duplicate-name`, `never-with-registry-entry`, `registry-mismatch`, `nested-island`, `dead-island`. |
| `ssg-audit` | fast | `architecture` | SSG / ISR convention checker — `_404.tsx` placement (`404-outside-layout-dir`), dynamic routes missing `getStaticPaths` (warn — legit under `mode: 'ssr'`/`'isr'`), non-literal `revalidate` exports. |
| `content-audit` | fast | `architecture` | `@pyreon/zero-content` content — `missing-frontmatter-title`, `broken-internal-link`, `orphaned-md-file`. Validated per-config so two apps that both mount `/docs` don't cross-contaminate. |
| `native-audit` | fast | `architecture` | Multiplatform (PMTC) build hazards in `.tsx` files importing `@pyreon/primitives` — `web-only-package-import` (a package that can't render on native) and `native-unsupported-decl` (a top-level `interface`/`enum`/`class` PMTC silently drops). Both warnings — they don't break the web build. Skips when no `@pyreon/primitives` importer is found. |
| `audit-tests` | fast | `testing` | The mock-vnode anti-pattern — tests that build `{ type, props, children }` literals (or a `vnode()` helper) instead of going through real `h()`. Classifies each file HIGH / MEDIUM / LOW. |
| `check-dedup` | fast | `architecture` | Duplicate `@pyreon/*` versions in the lockfile (`bun.lock` / `package-lock.json` / `pnpm-lock.yaml`). Multiple module instances of one Pyreon package break framework contracts; this catches it statically before the runtime sentinel throws. |
| `audit-leak-classes` | fast | `best-practices` (advisory) | The memory-leak class heuristics (Class A / C / D / I). **Advisory** — false-positive-prone, so findings are VISIBLE but excluded from the grade and from `--ci`. |
| `audit-types` | slow | `architecture` | Typed-but-unimplemented public fields — interface fields with zero non-type references in their owning package (the `mode: "ssg"` typed-but-never-read bug class). Requires `--full`. |
| `bundle-budgets` | slow | `performance` | Each published package's gzipped main-entry size against its locked budget (`over-budget`), packages missing a budget entry (`missing-budget`), and packages the bundler couldn't measure (`bundle-failed`). Requires `--full`. |

When a gate is excluded (slow gates without `--full`, or `--skip`/`--only` filtering), it appears in the report's **skipped footer** with the reason — `enable with --full` for slow gates, `skipped` for user-filtered ones. Some gates self-skip when their target surface is absent: `native-audit` (no `@pyreon/primitives` importer), `audit-types` (no `scripts/audit-types.ts`, i.e. outside the Pyreon monorepo).

### The score

The score is a simple **mean of the included category subscores**. A category with no contributing gate is excluded from the mean rather than counted as a misleading 100 — an unmeasured category shouldn't pull the average up.

Per-finding penalty by severity:

| Severity | Penalty |
| --- | --- |
| `error` | 10 points |
| `warning` | 3 points |
| `info` | 1 point |

Each category subscore is `100 - clamp(sum of penalties, 0, 100)`, so 10 errors saturate a category to 0, 33 warnings cost 99 points, and so on. The mental math is predictable by design: **fix one error, gain 10 points** (capped at 100).

The `best-practices` category is **advisory** — it is scored and displayed (so opt-in best-practice findings stay visible), but it is NEVER folded into the overall mean or grade, and its errors never fail `--ci`. Opinionated rules shouldn't tank an objective health score.

Letter grades:

| Grade | Score |
| --- | --- |
| A | 90-100 |
| B | 80-89 |
| C | 70-79 |
| D | 60-69 |
| F | below 60 |

### Flags

| Flag | Effect |
| --- | --- |
| `--full` | Include the slow gates (`audit-types`, `bundle-budgets`). |
| `--fix` | Auto-fix what's fixable — `lint` rules with auto-fixers + `react-patterns` migrations. Writes to disk; applied fixes surface as `info` findings, residual issues stay as warnings/errors. |
| `--only <gates>` | Run ONLY the listed comma-separated gates. Takes precedence over `--full` and the default set. |
| `--skip <gates>` | Exclude the listed comma-separated gates (applied after `--only`). |
| `--format <text\|json\|gha>` | Output format (default: `text`). |
| `--json` | Shortcut for `--format=json` — emits the full `DoctorReport`. |
| `--gha` | Shortcut for `--format=gha` — GitHub Actions annotation lines. |
| `--ci` | Exit non-zero on **error** findings only (advisory `best-practices` errors excluded; warnings/info never fail). |
| `--audit-min-risk <high\|medium\|low>` | Minimum risk floor for the `audit-tests` gate (default: `medium`). |
| `--help`, `-h` | Print usage. |
| `--version`, `-v` | Print the CLI version. |

Valid gate names for `--only` / `--skip`: `react-patterns`, `pyreon-patterns`, `lint`, `distribution`, `doc-claims`, `islands-audit`, `ssg-audit`, `content-audit`, `native-audit`, `audit-tests`, `check-dedup`, `audit-leak-classes`, `audit-types`, `bundle-budgets`. An unknown gate name is rejected with an error listing the valid set.

```bash
pyreon doctor                                  # 12 fast gates + score
pyreon doctor --full                           # add audit-types + bundle-budgets (14 gates)
pyreon doctor --only lint,react-patterns       # run a focused subset
pyreon doctor --skip doc-claims                # everything except doc-claims
pyreon doctor --only audit-types --full        # one slow gate in isolation
pyreon doctor --fix                            # auto-fix lint + react-patterns
pyreon doctor --ci                             # CI gate — exit non-zero on errors
pyreon doctor --json                           # full report for AI agents / dashboards
pyreon doctor --gha                            # GitHub Actions inline annotations
pyreon doctor --audit-min-risk high            # only HIGH-risk test-env findings
```

:::warning{title="Plain doctor always exits 0"}
Without `--ci`, `pyreon doctor` is **informational** — it prints the report and always exits 0, so it never breaks an interactive run or a `&&` chain. Use `--ci` to gate a build: it exits non-zero **only** on non-advisory error findings. Warnings and info never fail CI, and advisory `best-practices` errors are excluded (opinionated rules don't break builds).
:::

### Output formats

#### Text (default)

The human-readable renderer (`--format=text`, the default) prints, in order:

1. **Banner** — `pyreon doctor · project health audit` + `Score: N/100   Grade: X`.
2. **Per-category bars** — a 12-cell bar per category, colored by grade, with an `E`/`W`/`i` breakdown (`1E 2W 3i`) or `clean`. The advisory `best-practices` row is labeled `advisory — excluded from grade & --ci` so it's never mistaken for a grade-affecting bucket. A category with no contributing gate shows `skipped`.
3. **Top findings** — up to 10 findings, each with a severity glyph (`✗` error, `!` warning, `ℹ` info), the bolded message, the `<gate>/<rule>` code, a clickable file location, related locations (`↳`), and a `fix:` hint. A `…and N more` line points to `--json` for the full list.
4. **Footer** — skipped gates with reasons, total counts, gate count, and elapsed wall-clock.

Colors degrade gracefully via `@pyreon/ansi` (respects `NO_COLOR` / `FORCE_COLOR` / TTY detection), and file paths are OSC-8 hyperlinks in terminals that support them (iTerm2, WezTerm, kitty, VS Code).

#### JSON (`--json` / `--format=json`)

Emits the full `DoctorReport` as pretty-printed JSON — the stable shape consumed by AI agents, CI dashboards, and third-party tooling.

```bash
pyreon doctor --json
```

```json
{
  "score": 92,
  "grade": "A",
  "categories": [
    { "category": "correctness", "score": 87, "errors": 1, "warnings": 1, "infos": 0, "grade": "B", "included": true },
    { "category": "performance", "score": 100, "errors": 0, "warnings": 0, "infos": 0, "grade": "A", "included": false },
    { "category": "architecture", "score": 100, "errors": 0, "warnings": 0, "infos": 0, "grade": "A", "included": true },
    { "category": "testing", "score": 100, "errors": 0, "warnings": 0, "infos": 0, "grade": "A", "included": true },
    { "category": "documentation", "score": 100, "errors": 0, "warnings": 0, "infos": 0, "grade": "A", "included": true },
    { "category": "best-practices", "score": 100, "errors": 0, "warnings": 0, "infos": 0, "grade": "A", "included": false }
  ],
  "gates": [
    {
      "gate": "react-patterns",
      "category": "correctness",
      "findings": [
        {
          "category": "correctness",
          "severity": "error",
          "code": "react-patterns/no-usestate",
          "gate": "react-patterns",
          "message": "useState imported from React. Use signal() from @pyreon/reactivity.",
          "location": { "path": "/abs/src/App.tsx", "relPath": "src/App.tsx", "line": 1, "column": 9 },
          "fix": "import { signal } from \"@pyreon/reactivity\"",
          "fixable": false
        }
      ],
      "meta": { "scanned": 42, "elapsedMs": 31 }
    }
  ],
  "findings": [ "…flat list, ordered errors → warnings → info" ],
  "totals": { "errors": 1, "warnings": 1, "infos": 0 },
  "elapsedMs": 1402,
  "timestamp": "2026-06-24T10:00:00.000Z"
}
```

Top-level keys: `score`, `grade`, `categories` (always 6 entries, `included` flags coverage), `gates` (every gate that ran or was skipped, with `meta`), `findings` (the flat sorted list), `totals`, `elapsedMs` (wall-clock), and `timestamp` (ISO, for diffing runs).

:::tip{title="Diffing scores over time"}
The `timestamp` + `score` fields make it easy to track health across commits — write `pyreon doctor --json` to an artifact in CI and compare the score between the base branch and the PR.
:::

#### GitHub Actions (`--gha` / `--format=gha`)

Emits one `::error` / `::warning` / `::notice` workflow-command line per finding, which GitHub renders as **inline annotations** in the PR's "Files changed" tab. Doctor `error` → GHA `error`, `warning` → `warning`, `info` → `notice`. A summary `::notice::` header carries the score + totals.

```bash
pyreon doctor --gha
```

```text
::notice::pyreon doctor score: 92/100 (A) — 1 errors, 1 warnings, 0 info
::error title=react-patterns%2Fno-usestate,file=src%2FApp.tsx,line=1,col=9::useState imported from React. Use signal() from @pyreon/reactivity. — import { signal } from "@pyreon/reactivity"
::warning title=react-patterns%2FclassName,file=src%2FApp.tsx,line=3,col=18::className → class (HTML standard attribute).
```

Property values (`file=`, `title=`) are URL-encoded so commas and colons in paths don't truncate the annotation.

### CI usage

The canonical CI shape is `pyreon doctor --ci` (exit non-zero on errors) combined with `--gha` for inline PR annotations:

```yaml
# .github/workflows/health.yml
name: Health
on: [pull_request]
jobs:
  doctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      # Inline annotations on the PR (always exits 0 in this mode unless --ci added)
      - run: bunx pyreon doctor --gha
      # The actual gate — fails the job on any error finding
      - run: bunx pyreon doctor --ci
```

`--ci` and `--gha`/`--json` are independent: `--ci` controls the **exit code**, the format flags control the **output**. To both annotate and gate in one run, combine them — `pyreon doctor --gha --ci` prints GHA annotations and exits non-zero on errors.

For a focused gate in CI (e.g. only the islands audit on a PR that touched island code):

```bash
pyreon doctor --only islands-audit --ci
```

:::tip{title="Slow gates in CI"}
`--full` adds `audit-types` and `bundle-budgets`, which are the slowest gates (~15-30s for bundle-budgets across 50+ packages). Run them on a schedule or on `main` pushes rather than on every PR, and keep the fast set on the PR path.
:::

### Legacy flags

The pre-v2 single-purpose flags still work — they map to `--only <gate>` shortcuts so existing CI scripts keep functioning unchanged:

| Legacy flag | Equivalent |
| --- | --- |
| `--audit-tests` | `--only audit-tests` |
| `--check-islands` | `--only islands-audit` |
| `--check-ssg` | `--only ssg-audit` |
| `--check-content` | `--only content-audit` |
| `--check-native` | `--only native-audit` |

```bash
pyreon doctor --check-islands                          # == --only islands-audit
pyreon doctor --audit-tests --audit-min-risk high      # filtered test-env audit
pyreon doctor --check-ssg --json                       # SSG audit, machine-readable
pyreon doctor --check-native                           # multiplatform PMTC hazards
```

When you pass multiple legacy flags together, they compose into a single `--only` set (e.g. `--check-islands --check-ssg` runs both). An explicit `--only` always wins over the legacy flags.

### Gate deep-dives

A few gates are worth understanding in detail.

#### `islands-audit`

The same scanner as the MCP `audit_islands` tool. It flags:

- **`duplicate-name`** (error) — two `island()` calls with the same `name`; only the first hydrates, the rest silently fail.
- **`never-with-registry-entry`** (error) — a `hydrate: 'never'` island paired with a manual `hydrateIslands({ … })` registry entry (which pulls the component into the client bundle, defeating the zero-JS strategy).
- **`registry-mismatch`** (error) — a `hydrateIslands({ X })` entry where `X` has no matching `island()` declaration (typo / removed island).
- **`nested-island`** (error) — an `island()` whose loader-target file also contains an `island()` (the outer's hydration replaces the inner subtree before its loader runs).
- **`dead-island`** (warning) — an `island()` no other source imports (declared but never wired up — warning because it might be intentional mid-refactor).

#### `audit-tests`

Scans every `*.test.{ts,tsx}` for the mock-vnode anti-pattern — tests that hand-construct `{ type, props, children }` literals instead of going through real `h()` from `@pyreon/core`. Mock-only tests pass while the real rendering pipeline stays unexercised, which is exactly how a silent metadata-drop bug shipped once. Each file is classified HIGH / MEDIUM / LOW from the balance of mock-literal count, helper-definition count, helper-call count, and real-`h()`-call count. `--audit-min-risk` sets the floor (default `medium`, so LOW findings are hidden unless you pass `--audit-min-risk low`). Risk → severity: HIGH = error, MEDIUM = warning, LOW = info.

#### `check-dedup`

Parses `bun.lock`, `package-lock.json`, or `pnpm-lock.yaml` (whichever exists) and flags any `@pyreon/*` package resolving to more than one version. Two instances of the same Pyreon package break framework contracts — signal tracking, lifecycle hooks, context propagation — and the runtime singleton sentinel throws on first dual-load. This gate catches the installed-state mismatch statically, before deploy. The fix is to pin a single version and remove the conflicting transitive entries.

#### `audit-types`

A `--full` gate that walks every exported interface in the high-risk Pyreon packages (`zero`, `router`, `core`, `server`, `runtime-server`, `vite-plugin`) and counts non-type references. A public field with **zero** non-type references is the typed-but-unimplemented bug class — a config option that's documented and typed but the runtime never reads. It maps HIGH → error, MEDIUM → warning, LOW → info. Outside the Pyreon monorepo (no `scripts/audit-types.ts`) it skips gracefully.

## `pyreon context`

The `context` command scans your project's structure and writes a machine-readable summary to `.pyreon/context.json`, designed to be fed to AI coding assistants and consumed by `@pyreon/mcp`.

```bash
pyreon context                          # writes .pyreon/context.json
pyreon context --out path/to/ctx.json   # custom output path
```

The scan (delegated to `@pyreon/compiler`'s project scanner) detects:

- **Components** — your Pyreon components.
- **Routes** — file-system routes.
- **Islands** — `island()` declarations.

It writes the JSON, prints a summary, and **ensures `.pyreon/` is in your `.gitignore`** (the directory is a generated artifact, not source). On success:

```text
  ✓ Generated .pyreon/context.json (42 components, 7 routes, 3 islands)
```

The output JSON is stable and pipeable — drop it into an LLM prompt for project-aware assistance, or let `@pyreon/mcp` read it to answer questions about your codebase. Re-run it after structural changes (new routes, new islands) to refresh the snapshot.

## `pyreon info`

The `info` command reports your environment and every installed `@pyreon/*` package version — and flags **version skew** before it bites.

```bash
pyreon info          # environment + installed @pyreon versions + skew check
pyreon info --json   # machine-readable report
```

It prints the CLI version, runtime (node / bun / platform), the project name (and whether it's a `@pyreon/zero` app), and the `@pyreon/*` packages in `node_modules` with their versions. Pyreon ships its packages on **one synced version trajectory**, so a healthy project has them all on the same version:

```text
  ✓ All @pyreon packages on 0.37.0
```

When the installed set spans more than one version, `info` flags it — this is the condition that can trip the `registerSingleton` duplicate-instance guard (`[Pyreon] Duplicate @pyreon/X detected`) and split context/reactivity across instances at runtime:

```text
  ! Version skew — 2 versions installed:
      0.37.0: @pyreon/core, @pyreon/router
      0.30.0: @pyreon/query
```

`info` is **self-contained** — it reads only your `package.json` and `node_modules/@pyreon/*`, so it works in any project (or none) without requiring the framework packages to be installed.

## `pyreon upgrade`

The `upgrade` command is the **fix** for the skew `pyreon info` detects — it rewrites every `@pyreon/*` dependency range in `package.json` to a single version.

```bash
pyreon upgrade              # dry-run: print the alignment plan
pyreon upgrade --write      # apply (rewrite package.json), then install
pyreon upgrade --to 0.37.0  # target a specific version
pyreon upgrade --exact      # pin without the caret (0.37.0, not ^0.37.0)
```

By default the target is the **highest** `@pyreon/*` version already present (aligning laggards up); pass `--to <version>` to choose. It is **dry-run by default** — it prints what would change and applies nothing until you pass `--write`:

```text
  pyreon upgrade → align 1 package(s) to 0.37.0

    @pyreon/core  ^0.30.0 → ^0.37.0
```

After `--write`, run your package manager's install to pull the aligned versions. `workspace:` / `link:` / `file:` / git specifiers and non-`@pyreon` dependencies are left untouched.

## `pyreon lint`

`pyreon lint` is the unified front door to `@pyreon/lint` — it forwards **every** `pyreon-lint` flag verbatim.

```bash
pyreon lint                  # lint . with the recommended preset
pyreon lint src --fix        # auto-fix fixable findings
pyreon lint --preset strict  # any pyreon-lint flag works
pyreon lint --format json    # text (default) | json | compact
pyreon lint --watch          # re-lint on change
pyreon lint --lsp            # language-server mode (inlay hints + diagnostics)
```

`pyreon lint` and the standalone `pyreon-lint` binary share **one** implementation (the exported `runCli` entry), so the two can never drift. It exits non-zero when there are lint errors — drop it into CI exactly like `pyreon-lint`.

## Programmatic API

`@pyreon/cli` exports its core functions so you can run the doctor or generate context from your own scripts (CI runners, custom dashboards, editor extensions):

```ts
import { doctor, generateContext } from '@pyreon/cli'
import type {
  DoctorOptions,
  DoctorReport,
  GateName,
  ContextOptions,
  ProjectContext,
} from '@pyreon/cli'

// Run the doctor and inspect the report
const exitCode = await doctor({
  cwd: process.cwd(),
  fix: false,
  json: false,
  ci: true,
  full: false,
  only: ['lint', 'react-patterns'] as GateName[],
})
// In --ci mode, the returned number is the count of non-advisory error
// findings (the CLI exits 1 when it's > 0). Without --ci, it's the total
// finding count and the CLI exits 0.

// Generate the project context programmatically
const context: ProjectContext = await generateContext({
  cwd: process.cwd(),
  outPath: '.pyreon/context.json',
})
console.log(context.components.length, 'components')
```

`doctor(options)` returns a `Promise<number>` (the exit-code-shaped count described above) and prints the chosen format to stdout. `generateContext(options)` returns the scanned `ProjectContext` and writes it to disk.

## Reference

### Commands

| Command | Description |
| --- | --- |
| `pyreon check [paths] [--fix] [--json]` | Fast, file-scoped Pyreon/React anti-pattern scan (compiler detectors) with inline fixes. No paths → git-changed files. Exits non-zero on findings. |
| `pyreon add <pkg...> [--dry-run] [--json]` | Install `@pyreon/*` packages (PM auto-detected) and print a tailored setup recipe for each. |
| `pyreon new [name] [--native]` | Scaffold a new Pyreon project (delegates to `@pyreon/create-zero`, or `-multiplatform` with `--native`). |
| `pyreon mcp [args]` | Launch the Pyreon MCP server (delegates to `@pyreon/mcp`; prefers the project-local install). |
| `pyreon doctor [options]` | Project-wide health audit with a 0-100 score. Runs 12 fast gates by default; `--full` enables 2 slow gates. |
| `pyreon context [--out <path>]` | Generate `.pyreon/context.json` for AI tools. |
| `pyreon --help` / `-h` | Show usage. |
| `pyreon --version` / `-v` | Show the CLI version. |

### `doctor` options

| Flag | Type | Default | Description |
| --- | --- | --- | --- |
| `--full` | boolean | off | Include slow gates (`audit-types`, `bundle-budgets`). |
| `--fix` | boolean | off | Auto-fix `lint` + `react-patterns` findings (writes to disk). |
| `--only <gates>` | comma list | — | Run ONLY these gates. |
| `--skip <gates>` | comma list | — | Skip these gates. |
| `--format <fmt>` | `text\|json\|gha` | `text` | Output format. |
| `--json` | boolean | off | Shortcut for `--format=json`. |
| `--gha` | boolean | off | Shortcut for `--format=gha`. |
| `--ci` | boolean | off | Exit non-zero on non-advisory error findings. |
| `--audit-min-risk <r>` | `high\|medium\|low` | `medium` | Minimum risk for the `audit-tests` gate. |
| `--audit-tests` | boolean | off | Legacy → `--only audit-tests`. |
| `--check-islands` | boolean | off | Legacy → `--only islands-audit`. |
| `--check-ssg` | boolean | off | Legacy → `--only ssg-audit`. |
| `--check-content` | boolean | off | Legacy → `--only content-audit`. |
| `--check-native` | boolean | off | Legacy → `--only native-audit`. |

### Gates at a glance

| Gate | Speed | Default category | Severity range |
| --- | --- | --- | --- |
| `react-patterns` | fast | `correctness` | error / warning / info |
| `pyreon-patterns` | fast | `correctness` | warning |
| `lint` | fast | per-rule | error / warning / info |
| `distribution` | fast | `architecture` | error |
| `doc-claims` | fast | `documentation` | error |
| `islands-audit` | fast | `architecture` | error / warning |
| `ssg-audit` | fast | `architecture` | error / warning |
| `content-audit` | fast | `architecture` | error / warning |
| `native-audit` | fast | `architecture` | warning |
| `audit-tests` | fast | `testing` | error / warning / info |
| `check-dedup` | fast | `architecture` | error |
| `audit-leak-classes` | fast | `best-practices` (advisory) | info |
| `audit-types` | slow (`--full`) | `architecture` | error / warning / info |
| `bundle-budgets` | slow (`--full`) | `performance` | error / warning |

### Score formula

| Concept | Value |
| --- | --- |
| Error penalty | 10 points |
| Warning penalty | 3 points |
| Info penalty | 1 point |
| Category subscore | `100 - clamp(sum of penalties, 0, 100)` |
| Overall score | mean of *included* category subscores |
| Advisory category | `best-practices` — scored + shown, excluded from grade & `--ci` |
| Grade A / B / C / D / F | 90+ / 80-89 / 70-79 / 60-69 / `<60` |

### Exports

| Export | Kind | Description |
| --- | --- | --- |
| `doctor(options)` | function | Run the health audit; returns the exit-code-shaped finding count. |
| `generateContext(options)` | function | Scan the project and write `.pyreon/context.json`. |
| `DoctorOptions` | type | Options for `doctor()`. |
| `DoctorReport` | type | The aggregated report shape (`--json` output). |
| `GateName` | type | Union of all 14 gate names. |
| `ContextOptions` | type | Options for `generateContext()`. |
| `ProjectContext` | type | The scanned project shape. |
