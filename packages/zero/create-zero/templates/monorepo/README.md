# {{name}}

Bun workspaces monorepo scaffolded by `@pyreon/create-zero`.

## Layout

```
{{name}}/
├── apps/
│   └── web/              # Pyreon Zero application
├── packages/
│   ├── ui/               # Shared UI components (@{{name}}/ui)
│   └── types/            # Shared types (@{{name}}/types)
├── package.json          # workspace root
└── tsconfig.json         # project references
```

## Getting started

```bash
bun install
bun run dev          # → apps/web on http://localhost:3000
```

## Workspace scripts

| Command | What it does |
|---|---|
| `bun run dev` | Start the web app's dev server |
| `bun run build` | Build the web app for production |
| `bun run preview` | Preview the production build |
| `bun run typecheck` | Typecheck every workspace |
| `bun run --filter='@{{name}}/ui' build` | Build a specific package |

## Adding code

- **Pages / routes** — drop a file under `apps/web/src/routes/`.
- **Shared components** — add to `packages/ui/src/index.ts` and import
  in the web app as `import { Button } from '@{{name}}/ui'`.
- **Shared types** — add to `packages/types/src/index.ts` and import as
  `import type { User } from '@{{name}}/types'`.

Workspace deps use `workspace:^` — changes in `packages/*` are picked
up immediately by `apps/web` (no build step in dev).

## Adding more apps

Add a new `apps/<name>/` directory with its own `package.json`. Bun
picks it up automatically from the root `workspaces` declaration.
