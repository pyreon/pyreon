# @pyreon/query

- TanStack Query adapter: `useQuery`, `useMutation`, `useInfiniteQuery`, `useQueries`, `useSuspenseQuery` and the rest; `/persist` and `/devtools` subpaths.
- Pass `useQuery` options as a function (`useQuery(() => ({ queryKey: [id()], … }))`) so `queryKey` can read signals and refetch reactively. `useMutation` takes a plain object.
- `defineQueries({ … })` declares named parallel queries.
- Results are fine-grained per-field signals, created lazily behind property getters.
- Type helpers `QueryData`/`QueryError` unwrap the result bags.
- Re-exports query-core, pinned repo-wide through `overrides`.
