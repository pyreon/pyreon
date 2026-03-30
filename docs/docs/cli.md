---
title: "@pyreon/cli"
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
