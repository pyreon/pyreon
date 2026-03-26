# Project

This project uses Pyreon Zero, a signal-based full-stack meta-framework. Do NOT use React patterns.

## Reactivity

- Use `signal()` not `useState`
- Use `computed()` not `useMemo`
- Use `effect()` not `useEffect`
- Use `onMount` / `onUnmount` not `useEffect` with deps
- Use `signal.set(value)` or `signal.update(fn)` to write signals
- Read signals by calling them: `count()` not `count`

## JSX

- Use `class=` not `className`
- Use `for=` not `htmlFor`
- Use camelCase events: `onClick`, `onMouseEnter`, `onLoad` (not `onclick`, `onmouseenter`)
- Use `srcSet` not `srcset`, `fetchPriority` not `fetchpriority`
- Reactive text: `{() => count()}`
- Conditional: `{() => show() ? <A /> : null}`
- Lists: `{() => items().map(item => <Item />)}`
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
