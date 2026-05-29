---
title: '@pyreon/cli'
description: CLI tools for Pyreon — doctor and context commands.
---

`@pyreon/cli` provides command-line tools for Pyreon projects: a project-wide health audit (`doctor`) and project context inspection for AI tools (`context`).

<PackageBadge name="@pyreon/cli" href="/docs/cli" />

## Installation

::: code-group

```bash [npm]
npm install @pyreon/cli
```

```bash [bun]
bun add @pyreon/cli
```

```bash [pnpm]
pnpm add @pyreon/cli
```

```bash [yarn]
yarn add @pyreon/cli
```

:::

## Overview

### `doctor`

`pyreon doctor` is a project-wide health audit. It runs a set of independent **gates** in parallel, aggregates every finding into a unified report, and computes a **0-100 health score** with a letter grade and a per-category bar chart (modeled after [react.doctor](https://www.react.doctor/)).

```bash
pyreon doctor
```

By default it runs the **8 fast gates** (~1-2s wall-clock on a warm cache). The 2 slow gates are opt-in via `--full`.

```text
  pyreon doctor · project health audit

  Score:  92/100   Grade: A

  Per category:

  correctness    █████████░░░  87 · 1E 1W
  performance    ████████████ 100 · clean
  architecture   ████████████ 100 · clean
  testing        ████████████ 100 · clean
  documentation  ████████████ 100 · clean

  Top findings (2 of 2):

  ✖ useState imported from React. Use signal() from @pyreon/reactivity.
     src/App.tsx:1:9
     fix: import { signal } from "@pyreon/reactivity"

  ⚠ className → class (HTML standard attribute).
     src/App.tsx:3:18

  1 error · 1 warning · 8 gates · 1.4s
```

#### Gates

Each gate emits findings with a `category`, a `severity` (`error` / `warning` / `info`), and a stable `<gate>/<rule>` code. The default category drives where the gate's findings land in the score breakdown.

| Gate              | Speed | Category        | What it checks                                                                                                                             |
| ----------------- | ----- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `react-patterns`  | fast  | `correctness`   | "Coming from React" mistakes — `useState`, `useEffect`, `className`, `htmlFor`, `onChange` on inputs, `.value` writes, React imports.      |
| `pyreon-patterns` | fast  | `correctness`   | "Using Pyreon wrong" mistakes — `<For>` missing `by`, destructured props, bundler-coupled dev gates, signal-write-as-call, and 8 more.     |
| `lint`            | fast  | `correctness`   | All `@pyreon/lint` rules across the project.                                                                                               |
| `distribution`    | fast  | `architecture`  | Published-package hygiene — `sideEffects` declared, source maps shipped (not excluded via `!lib/**/*.map`).                                |
| `doc-claims`      | fast  | `documentation` | Numeric claims in human-written docs match the source of truth (hook count, doc-page count). Skipped automatically in non-Pyreon projects. |
| `audit-tests`     | fast  | `testing`       | The mock-vnode anti-pattern — tests that build `{ type, props, children }` literals instead of going through real `h()`.                   |
| `islands-audit`   | fast  | `architecture`  | Cross-file islands detectors — duplicate name, never+registry, registry mismatch, nested island, dead island.                              |
| `ssg-audit`       | fast  | `architecture`  | SSG-config consistency checks.                                                                                                             |
| `audit-types`     | slow  | `architecture`  | Typed-but-unimplemented public fields (zero non-type refs in the owning package). Requires `--full`.                                       |
| `bundle-budgets`  | slow  | `performance`   | Each published package's gzipped main-entry size stays within its locked budget. Requires `--full`.                                        |

The two slow gates only run with `--full`; otherwise they appear in the report's skipped footer with the reason `enable with --full`.

#### Score

The score is a simple mean of the **included** category subscores (a category with no contributing gate is excluded from the mean rather than counted as a misleading 100).

Per-finding penalty by severity:

- `error` — 10 points
- `warning` — 3 points
- `info` — 1 point

Each category subscore is `100 - clamp(sum of penalties, 0, 100)`, so 10 errors saturate a category to 0, 33 warnings cost 1 point, and so on. "Fix one error, gain 10 points (capped at 100)" is predictable by design.

Letter grades:

| Grade | Score    |
| ----- | -------- |
| A     | 90-100   |
| B     | 80-89    |
| C     | 70-79    |
| D     | 60-69    |
| F     | below 60 |

#### Flags

| Flag                                 | Effect                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| `--full`                             | Include the slow gates (`audit-types`, `bundle-budgets`).                          |
| `--fix`                              | Auto-fix where possible (`lint` + `react-patterns` findings with auto-fixers).     |
| `--only <gates>`                     | Run ONLY the listed comma-separated gates. Takes precedence over `--full`.         |
| `--skip <gates>`                     | Exclude the listed comma-separated gates (applied after `--only`).                 |
| `--format text\|json\|gha`           | Output format (default: `text`).                                                   |
| `--json`                             | Shortcut for `--format=json` — emits the full `DoctorReport`.                      |
| `--gha`                              | Shortcut for `--format=gha` — GitHub Actions annotation lines for inline PR notes. |
| `--ci`                               | Exit non-zero on **error** findings only (warnings/infos don't fail the build).    |
| `--audit-min-risk high\|medium\|low` | Minimum risk floor for the `audit-tests` gate (default: `medium`).                 |

Valid gate names for `--only` / `--skip`: `react-patterns`, `pyreon-patterns`, `lint`, `distribution`, `doc-claims`, `audit-tests`, `islands-audit`, `ssg-audit`, `audit-types`, `bundle-budgets`.

```bash
pyreon doctor                                  # 8 fast gates + score
pyreon doctor --full                           # add audit-types + bundle-budgets
pyreon doctor --only lint,react-patterns       # run a focused subset
pyreon doctor --skip doc-claims                # everything except doc-claims
pyreon doctor --fix                            # auto-fix lint + react-patterns
pyreon doctor --ci                             # CI gate — exit non-zero on errors
pyreon doctor --json                           # full report for AI agents / dashboards
pyreon doctor --gha                            # GitHub Actions inline annotations
```

Without `--ci`, the exit code is the total count of findings (errors + warnings + infos), so `pyreon doctor && echo green` works as a quick clean-tree check. With `--ci`, only error findings affect the exit code.

#### Legacy flags

The pre-v2 single-purpose flags still work — they map to `--only <gate>` shortcuts so existing CI scripts keep functioning unchanged:

| Legacy flag       | Equivalent             |
| ----------------- | ---------------------- |
| `--audit-tests`   | `--only audit-tests`   |
| `--check-islands` | `--only islands-audit` |
| `--check-ssg`     | `--only ssg-audit`     |

```bash
pyreon doctor --check-islands                          # == --only islands-audit
pyreon doctor --audit-tests --audit-min-risk high      # filtered test-env audit
pyreon doctor --check-ssg --json                       # SSG audit, machine-readable
```

The `islands-audit` gate is the same scanner as the MCP `audit_islands` tool, flagging: `duplicate-name` (two `island()` calls with the same `name` — only the first hydrates), `never-with-registry-entry` (`hydrate: 'never'` paired with a manual registry entry), `registry-mismatch` (`hydrateIslands({ X })` where `X` has no matching `island()`), `nested-island` (an `island()` whose loader-target file also contains an `island()`), and `dead-island` (an `island()` no other source imports).

The `audit-tests` gate scans every `*.test.{ts,tsx}` for the mock-vnode anti-pattern that caused PR #197's silent metadata drop, classifying files HIGH / MEDIUM / LOW. Three context-aware skips (helper-def vs binding discrimination, type-guard call-arg skip, template-string fixture mask) keep the false-positive rate low.

### `context`

The `context` command inspects your project structure and writes a machine-readable summary (`.pyreon/context.json`) designed for AI coding assistants.

- Lists detected routes, components, and islands
- Outputs JSON that can be piped into an LLM prompt or MCP server
- Used internally by `@pyreon/mcp` to provide project-aware assistance

```bash
pyreon context                       # writes .pyreon/context.json
pyreon context --out path/to/ctx.json   # custom output path
```
