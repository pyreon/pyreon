---
'@pyreon/native-compiler': minor
---

`<QueryClientProvider>` lowers instead of emitting code that cannot compile

`@pyreon/query`'s `useQuery` reads its client from `<QueryClientProvider>` on the
web — omit it and the hook throws `No QueryClient found`. The native lowering is
self-contained: `useQuery` becomes a `PyreonQuery` holding its own state, with no
client anywhere.

So the shape a web app MUST write had no dispatch entry and fell through to the
generic path, which emitted a `QueryClientProvider(client:)` view that exists on
neither target, plus a bare `createQueryClient` identifier reference for the
client binding. Both silent — zero warnings — and nothing in the suite compiled
the result. Same class as the `<RouterLink>` gap.

The provider is now transparent (its children are the whole emit) and the client
binding emits nothing, so a query-driven screen can be written once for all three
targets.
