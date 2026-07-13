---
"@pyreon/query": patch
---

Fix the `defineQueries` JSDoc `@example` (it showed the wrong call shape — a single function returning an object instead of an object of option-functions). Add an objective adapter head-to-head benchmark vs `@tanstack/react-query` (`bench:react-query`) — both wrap the same `@tanstack/query-core`, so it measures the adapter, not the engine — plus README/docs sections on the measured fine-grained-vs-react-render results (intra-component: 1 field-derivation + 0 component re-runs vs 8 + a whole-component re-render; cross-component is a tie thanks to react-query's tracked-props). Add consumer-shaped tests locking `select`, `keepPreviousData` on reactive keys, and optimistic `onMutate`/rollback pass-through.
