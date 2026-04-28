# Project

This project uses Pyreon Zero, a signal-based full-stack meta-framework. Do NOT use React patterns.

## Reactivity

- Use `signal()` not `useState`
- Use `computed()` not `useMemo`
- Use `effect()` not `useEffect`
- Use `onMount` / `onUnmount` not `useEffect` with deps
- Use `signal.set(value)` or `signal.update(fn)` to write signals
- In JSX, signals and computeds are **auto-called** — just write `{count}` not `{count()}`
- Outside JSX, call signals explicitly: `count()` to read, `count.set(5)` to write

## JSX

- Use `class=` not `className`
- Use `for=` not `htmlFor`
- Use camelCase events: `onClick`, `onMouseEnter`, `onLoad` (not `onclick`, `onmouseenter`)
- Signal auto-call in JSX: `{count}` — compiler inserts `()` for you
- Conditional: `{show ? <A /> : null}` — signals auto-called inside expressions too
- Lists: `{items().map(item => <Item />)}` — `.map()` still needs explicit `()`
- Events: `onClick={() => ...}`
- JSX import source is `@pyreon/core` (auto-configured, no manual import needed)

## File-Based Routing

- `src/routes/index.tsx` → `/`
- `src/routes/about.tsx` → `/about`
- `src/routes/[id].tsx` → `/:id`
- `src/routes/_layout.tsx` → layout wrapper
- `src/routes/_error.tsx` → error boundary
- `src/routes/_loading.tsx` → loading state
- `(group)/` → route group (no URL segment)

## Route Exports

- `default` — page component
- `loader` — server-side data fetching
- `guard` — navigation guard
- `middleware` — per-route server middleware
- `meta` — route metadata
- `renderMode` — per-route rendering mode override

## Data Patterns

- Use `defineStore()` from `@pyreon/store` for global state
- Use `useQuery()` from `@pyreon/query` for data fetching
- Use `useForm()` from `@pyreon/form` for forms
- Use `defineFeature()` from `@pyreon/feature` for schema-driven CRUD
- Use `defineAction()` from `@pyreon/zero/actions` for server mutations

## Commands

```bash
bun run dev       # Start dev server
bun run build     # Production build
bun run preview   # Preview production build
bun run doctor    # Check for React patterns
```
