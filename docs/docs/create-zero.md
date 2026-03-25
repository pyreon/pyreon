---
title: "@pyreon/create-zero"
description: Project scaffolding tool for creating new Pyreon Zero applications.
---

`@pyreon/create-zero` scaffolds new Pyreon Zero projects with a single command. It sets up the project structure, dependencies, configuration, and a starter template.

<PackageBadge name="@pyreon/create-zero" href="/docs/create-zero" />

## Installation

```bash
bun create @pyreon/zero my-app
```

Or with npx:

```bash
npx @pyreon/create-zero my-app
```

## Overview

Running the scaffolding command creates a new directory with a fully configured Pyreon Zero project:

```
my-app/
├── src/
│   ├── routes/
│   ├── components/
│   ├── stores/
│   └── app.tsx
├── public/
├── pyreon.config.ts
├── vite.config.ts
├── tsconfig.json
└── package.json
```

The generated project includes:

- **Pyreon Zero** with all fundamentals packages via `@pyreon/meta`
- **Vite** preconfigured with `@pyreon/vite-plugin`
- **TypeScript** with strict mode and Pyreon-specific type settings
- **Router** with a starter home route and layout
- **File-based routing** convention ready to use

After scaffolding, start the dev server:

```bash
cd my-app
bun install
bun dev
```
