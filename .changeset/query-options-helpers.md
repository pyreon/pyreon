---
'@pyreon/query': minor
---

Add `queryOptions`, `infiniteQueryOptions` and `mutationOptions`: declare a query or mutation once, typed, and reuse it in the hooks and the imperative `QueryClient` API. The returned `queryKey` is tagged with the data and error types (TanStack's `DataTag`, now re-exported), so `client.getQueryData(opts.queryKey)` and `setQueryData` are typed without a generic.
