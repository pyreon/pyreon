---
"@pyreon/query": patch
---

perf(query): ~70-75% smaller result objects via a shared getters-only prototype

`useQuery` / `useMutation` / `useInfiniteQuery` / `useSuspenseQuery` /
`useSuspenseInfiniteQuery` each returned an object literal with 8-13 accessor
getters PER CALL. That many accessors on a literal forces V8 into dictionary
(slow-properties) mode AND allocates a fresh getter closure per field per
result. The accessor getters now live on a shared, getters-only prototype (one
allocation at module init); each result is a 2-field plain object (`_slots` +
`_observer`) + `setPrototypeOf`. A structurally-faithful A/B (node `--expose-gc`,
`NODE_ENV=production`, 100k results) measured the literal shape at ~2048 B/result
vs ~512 B shipped (useQuery, -75%) / ~640 B (useMutation, -69%).

The lazy-signal slot-bag is unchanged (getters still do
`slots[k] ??= signal(observer.getCurrentResult().k)` — same `Signal` identity +
materialize-on-first-access). Methods (`refetch` / `mutate` / `mutateAsync` /
`reset` / `fetchNextPage` / `fetchPreviousPage`) stay as per-instance arrow
closures, NOT prototype methods, so detaching them (`const r = q.refetch; r()`,
`onClick={q.refetch}`) keeps working. The accessor getters are non-enumerable
(internals + signals stay out of `Object.keys` / spread).

Behavior-identical and API-unchanged: 154 query tests + the `@pyreon/feature`
consumer suite pass.
