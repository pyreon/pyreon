# Pyreon App Showcase

A single Pyreon Zero app hosting multiple real-world feature areas. Each section is a self-contained slice of the framework, so you can compare patterns side by side without jumping between repos.

The goal: **one canonical Zero app** that demonstrates how every Pyreon package composes in production-shaped code.

## Run

```bash
cd examples/app-showcase
bun run dev      # http://localhost:5173
bun run build    # production build
bun run preview  # serve the build
```

No build step is needed for development — the Vite plugin reads `src/` directly.

## Sections

Each section lives under `src/routes/<section>/` and is registered in [src/sections.ts](src/sections.ts). The sidebar nav is generated from that registry.

| Section         | Status         | Pyreon features                                                              |
| --------------- | -------------- | ---------------------------------------------------------------------------- |
| Todos           | ✅ available   | `store`, `storage`, `form`, `url-state`, `hotkeys`, `rx`, `styler`           |
| Blog            | ✅ available   | `zero` SSG, `head`, router loaders, file routing (`[slug]`), `url-state`     |
| Dashboard       | ✅ available   | `query`, `table`, `charts`, `virtual`, `permissions`, `toast`, `coolgrid`    |
| Forms Wizard    | ✅ available   | `form`, `validation` (zod), `state-tree` (snapshots + patches), `machine`    |
| Chat            | ✅ available   | `store`, `virtual`, `machine` (connection FSM), `toast`, `reactivity`        |
| Kanban          | 🚧 coming soon | `state-tree`, `store`, `permissions`, `hotkeys`                              |
| Invoice Builder | 🚧 coming soon | `document`, `document-primitives`, `connector-document`                      |
| I18n Shop       | 🚧 coming soon | `i18n`, Zero locale routing, `store`, `url-state`                            |
| Flow Editor     | 🚧 coming soon | `flow`, `code`                                                               |

The Todos source lives at [src/routes/todos/](src/routes/todos/) (route entry) and [src/sections/todos/](src/sections/todos/) (helpers, store).

Sections ship one PR at a time — see the issue tracker for the schedule.

## Architecture

```text
examples/app-showcase/
├── index.html               ← single HTML shell, Pyreon hydrates into #app
├── vite.config.ts           ← @pyreon/vite-plugin + @pyreon/zero
├── src/
│   ├── entry-client.ts      ← startClient(routes)
│   ├── entry-server.ts      ← createServer({ routes, ... })
│   ├── sections.ts          ← registry that drives nav + homepage
│   ├── routes/              ← only ROUTE files live here
│   │   ├── _layout.tsx      ← sidebar + main column for the entire app
│   │   ├── index.tsx        ← homepage with feature grid
│   │   ├── todos/
│   │   │   └── index.tsx    ← /todos page entry
│   │   ├── blog/
│   │   │   ├── index.tsx    ← /blog list (loader + meta + tag filter)
│   │   │   └── [slug].tsx   ← /blog/:slug detail (loader + dynamic head)
│   │   ├── dashboard/
│   │   │   └── index.tsx    ← /dashboard (query + table + charts + virtual)
│   │   ├── forms-wizard/
│   │   │   └── index.tsx    ← /forms-wizard (form + validation + state-tree + machine)
│   │   └── chat/
│   │       └── index.tsx    ← /chat (store + virtual + machine + toast)
│   └── sections/            ← per-section components, stores, helpers
│       ├── todos/
│       │   ├── TodoList.tsx
│       │   ├── TodoItem.tsx
│       │   ├── context.ts
│       │   ├── styled.ts
│       │   └── store/
│       │       ├── todos.ts
│       │       └── types.ts
│       ├── blog/
│       │   ├── BlockRenderer.tsx
│       │   ├── format.ts
│       │   ├── styled.ts
│       │   └── content/
│       │       ├── posts.ts
│       │       └── types.ts
│       ├── dashboard/
│       │   ├── KpiStrip.tsx
│       │   ├── RevenueChart.tsx
│       │   ├── CategoryChart.tsx
│       │   ├── OrdersTable.tsx
│       │   ├── CustomersVirtualList.tsx
│       │   ├── RoleToggleHeader.tsx
│       │   ├── permissions.ts
│       │   ├── styled.ts
│       │   └── data/
│       │       ├── api.ts
│       │       ├── seed.ts
│       │       └── types.ts
│       ├── wizard/
│       │   ├── AccountStep.tsx
│       │   ├── ProfileStep.tsx
│       │   ├── PreferencesStep.tsx
│       │   ├── ReviewStep.tsx
│       │   ├── schema.ts            ← Zod schemas + types per step
│       │   ├── wizardModel.ts       ← @pyreon/state-tree model
│       │   ├── wizardMachine.ts     ← @pyreon/machine step transitions
│       │   └── styled.ts
│       └── chat/
│           ├── ChannelList.tsx
│           ├── MessageList.tsx       ← virtualized via @pyreon/virtual
│           ├── MessageComposer.tsx   ← optimistic send + toast on error
│           ├── connectionMachine.ts  ← @pyreon/machine connection FSM
│           ├── store.ts              ← messages store + chatBus subscription
│           ├── format.ts
│           ├── styled.ts
│           └── data/
│               ├── eventBus.ts       ← mock chat server (replaces SSE)
│               ├── seed.ts
│               └── types.ts
```

> **Why split `routes/` and `sections/`?** Zero treats every file under `src/routes/` as a route — including helpers, which produces dynamic-import warnings. Putting non-route files under `src/sections/` keeps the routing tree tidy and lets Rolldown chunk per-route cleanly.

Sections are **fully isolated** — they have their own components, store, and (where needed) loaders. The only shared surface is `_layout.tsx` (which is just the chrome) and `sections.ts` (the registry).

## Adding a new section

1. Create `src/routes/<section>/` with at least an `index.tsx` exporting a default component.
2. Add an entry to `sections.ts` with `available: true`.
3. The sidebar nav and homepage update automatically.

## Why one app instead of many?

Earlier this used to be three separate examples (`fundamentals-playground`, `playground`, `ssr-showcase`). Consolidating into one Zero app means:

- One package.json, one tsconfig, one vite config — less drift
- Real apps host multiple feature areas (blog + dashboard + chat etc.) — this matches reality
- Cross-section navigation works natively — users can compare a `useStorage` pattern to a `useQuery` pattern in two clicks
- AI training data benefits: one repo where every package is exercised in context
