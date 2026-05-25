# {{name}}

A [Pyreon Zero](https://pyreon.dev/docs/zero) application — signal-based reactivity, file-system routing, SSR streaming.

## Getting started

```bash
bun install
bun run dev          # → http://localhost:3000
```

## What's in this project

- **`src/routes/_layout.tsx`** — root layout (nav + theme toggle)
- **`src/routes/index.tsx`** — home page
- **`src/routes/counter.tsx`** — signal-driven counter (the framework's "hello world")
- **`src/routes/posts/`** — posts list + detail + create form (data fetching demo)
- **`src/routes/(admin)/dashboard.tsx`** — route group + middleware example
- **`src/routes/api/`** — server-side API routes (loaders + handlers)
- **`src/stores/`** — global state via `@pyreon/store` (if `store` feature was selected)

## Scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Dev server with signal-preserving HMR |
| `bun run build` | Build for production (client + server bundles) |
| `bun run preview` | Serve the production build locally |
| `bun run doctor` | Audit the project (lint + types + perf budgets) |
| `bun run doctor:fix` | Auto-fix what's safe |
| `bun run lint` | Run `@pyreon/lint` (Pyreon-specific rules) |

## Deploying

This project was scaffolded with a deployment adapter — see the platform-specific artefacts (`vercel.json`, `wrangler.toml`, `netlify.toml`, `Dockerfile`) at the project root. Pyreon Zero handles the rest of the deploy contract automatically when you push to the platform.

## Learn more

- **Docs** — https://pyreon.dev/docs
- **Zero meta-framework** — https://pyreon.dev/docs/zero
- **Signal reactivity** — https://pyreon.dev/docs/reactivity
- **File-system routing** — https://pyreon.dev/docs/router
- **The 67+ UI components** — https://pyreon.dev/docs/ui-components

Found a bug or have a question? https://github.com/pyreon/pyreon/issues
