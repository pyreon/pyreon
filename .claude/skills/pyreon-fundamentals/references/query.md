# @pyreon/query

- **@pyreon/query**: full TanStack adapter — `useQuery`/`useMutation`/`useInfiniteQuery`/`useQueries`/`useSuspenseQuery` etc.; persist (`/persist` subpath) + devtools (`/devtools` subpath). **Options as a FUNCTION** (`useQuery(() => ({queryKey: [id()], ...}))`) so `queryKey` can read signals + refetch reactively; `useMutation` options are a plain object. `defineQueries({...})` named parallel queries. Fine-grained per-field signals, lazily materialized (slot-bag with property getters). Re-exports query-core (pinned tree-wide via `overrides`).
