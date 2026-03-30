---
title: '@pyreon/meta'
description: Barrel package re-exporting the full Pyreon fundamentals ecosystem for convenience.
---

`@pyreon/meta` is a barrel package that re-exports the entire Pyreon fundamentals ecosystem (store, form, validation, query, table, virtual, i18n, state-tree, feature, charts, code, document, flow, hotkeys, machine, permissions, storage, storybook) from a single import.

<PackageBadge name="@pyreon/meta" href="/docs/meta" />

## Installation

::: code-group

```bash [npm]
npm install @pyreon/meta
```

```bash [bun]
bun add @pyreon/meta
```

```bash [pnpm]
pnpm add @pyreon/meta
```

```bash [yarn]
yarn add @pyreon/meta
```

:::

## Overview

Instead of installing each fundamentals package individually:

```bash
bun add @pyreon/store @pyreon/form @pyreon/validation @pyreon/query @pyreon/table @pyreon/virtual @pyreon/i18n @pyreon/state-tree @pyreon/feature @pyreon/charts @pyreon/code @pyreon/document @pyreon/flow @pyreon/hotkeys @pyreon/machine @pyreon/permissions @pyreon/storage @pyreon/storybook
```

You can install `@pyreon/meta` once:

```bash
bun add @pyreon/meta
```

All exports are available directly:

```ts
import { createStore, createForm, createQuery, createTable } from '@pyreon/meta'
```

### Used by `@pyreon/zero`

`@pyreon/meta` is used internally by `@pyreon/zero` to bundle the full fundamentals layer. If you are already using `@pyreon/zero`, you do not need to install `@pyreon/meta` separately — it is included automatically.
