---
title: '@pyreon/cli'
description: CLI tools for Pyreon — doctor, generate, and context commands.
---

`@pyreon/cli` provides command-line tools for Pyreon projects including diagnostics (`doctor`), code generation (`generate`), and project context inspection (`context`).

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

The `doctor` command checks your project setup to catch common issues early.

- Verifies that required dependencies are installed and compatible
- Validates Pyreon configuration files (`pyreon.config.ts`, Vite plugin setup, etc.)
- Checks TypeScript and build tool settings for known pitfalls
- Reports a summary of passes, warnings, and errors

```bash
pyreon doctor
```

#### `--check-islands`

Run the project-wide islands audit (companion to the MCP `audit_islands` tool — same scanner, same five detectors). Walks `packages/` + `examples/` and flags:

- `duplicate-name` — two `island()` calls with the same `name` (only the first hydrates)
- `never-with-registry-entry` — `hydrate: 'never'` paired with a manual registry entry
- `registry-mismatch` — `hydrateIslands({ X })` where `X` has no matching `island()`
- `nested-island` — an `island()` whose loader-target file ALSO contains an `island()`
- `dead-island` — an `island()` no other source imports (statically OR dynamically)

```bash
pyreon doctor --check-islands
pyreon doctor --check-islands --json   # CI gate — pipe and grep findings.length > 0
```

#### `--audit-tests`

Scan every `*.test.{ts,tsx}` under `packages/` for the mock-vnode anti-pattern that caused PR #197's silent metadata drop. Files are classified HIGH / MEDIUM / LOW based on the balance of mock-vnode literals + helpers + helper-call sites vs real `h()` calls + `@pyreon/core` import.

```bash
pyreon doctor --audit-tests
pyreon doctor --audit-tests --audit-min-risk medium    # filter floor
pyreon doctor --audit-tests --json                     # machine-readable
```

Three context-aware skips (helper-def vs binding discrimination, type-guard call-arg skip, template-string fixture mask) keep the false-positive rate low. Run before merging a new test file or after a framework change to verify parallel real-`h()` coverage is in place.

### `generate`

The `generate` command scaffolds new code into your project.

- Generates components with the correct file structure and boilerplate
- Scaffolds stores with signal declarations and actions
- Creates route files wired into your router configuration

```bash
pyreon generate component MyButton
pyreon generate store auth
pyreon generate route /settings
```

### `context`

The `context` command inspects your project structure and outputs a machine-readable summary designed for AI coding assistants.

- Lists detected routes, components, stores, and islands
- Outputs JSON that can be piped into an LLM prompt or MCP server
- Used internally by `@pyreon/mcp` to provide project-aware assistance

```bash
pyreon context
```
