---
'@pyreon/query': minor
---

`useQuery` now takes TanStack's generic order — `useQuery<TQueryFnData, TError, TData = TQueryFnData, TKey>` — so `select` changes the result type: `useQuery(() => ({ queryKey, queryFn: fetchPosts, select: (p) => p.length }))` types `data()` as `number` with no cast. `useQuery<T>` and `useQuery<T, E>` are unchanged; a call passing a THIRD generic (previously the key type) must move it to the fourth position. New exported type `UseQueryOptions<TQueryFnData, TError, TData, TKey>`.
