---
"@pyreon/query": minor
---

`useInfiniteQuery<Page>(() => ({ queryKey, queryFn, initialPageParam, getNextPageParam }))` now lowers to iOS and Android. It becomes a `PyreonInfiniteQuery` container with `data`, `hasNextPage`, `isFetchingNextPage`, `isPending`, `isFetching`, `error` and `fetchNextPage()`. Shapes it cannot honour (a fetch init, `getPreviousPageParam`, `maxPages`, `staleTime`, a runtime `queryKey`) are named warnings that drop the declaration.
