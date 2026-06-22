---
title: Quickstart
description: Get a Pyreon app running in 60 seconds — try it live, then scaffold your own.
---

## Pyreon, running right now

The counter below is a **real Pyreon app**, mounted live on this page — no install, no sandbox. Click it. The number is a [signal](/docs/reactivity); the framework re-renders only that one text node when it changes.

<Example file="./examples/reactivity/signals-read-write-react" />

That's the whole model: a `signal` is a reactive value you read as a function (`count()`) and write with `.set()` / `.update()`. Read it inside JSX and the compiler makes that spot reactive — no virtual DOM, no re-running your component.

## Scaffold a new app (the 60-second path)

The fastest way to a complete, batteries-included project (router, SSR/SSG, dev server, TypeScript) is the scaffolder:

:::code-group

```bash [npm]
npm create @pyreon/zero@latest my-app
```

```bash [bun]
bun create @pyreon/zero my-app
```

```bash [pnpm]
pnpm create @pyreon/zero my-app
```

```bash [yarn]
yarn create @pyreon/zero my-app
```

:::

Then start the dev server:

:::code-group

```bash [npm]
cd my-app
npm install
npm run dev
```

```bash [bun]
cd my-app
bun install
bun run dev
```

```bash [pnpm]
cd my-app
pnpm install
pnpm run dev
```

```bash [yarn]
cd my-app
yarn
yarn dev
```

:::

Open the printed URL and you have a routed, server-rendered Pyreon app with hot-reload.

:::tip{title="Pick a starting point"}
Add `-- --template blog` (a markdown content site) or `-- --template monorepo` to start from a richer template, or `-- --preset standard --yes` to skip the prompts. See [Create Zero](/docs/create-zero) for every flag.
:::

## Prefer to wire it up by hand?

If you want to add Pyreon to an existing Vite project (or understand exactly what the scaffolder generates), the [Getting Started](/docs/getting-started) guide walks through the manual install + `vite.config.ts` setup, SSR, routing, and the compatibility layers — package by package.

## Next steps

- **[Build an App](/docs/build-an-app)** — a guided, interactive tutorial that builds a real Todo app step by step, each step running live on the page.
- **[Reactivity Rules](/docs/reactivity-rules)** — the handful of rules that make signals click ("components run once; reactivity is about *where* you read a signal").
- **[Why Pyreon](/docs/why-pyreon)** — the honest case: what Pyreon is fast at, where it isn't, and who it's for.
