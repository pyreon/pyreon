---
'@pyreon/query': minor
---

`@pyreon/query/persist`: a persisted mutation now stays in storage until it settles (succeeds or fails), whether it is paused offline or in flight, and is restored as paused so the next page resumes it. Before, only paused mutations were persisted, so any resume (including one fired while a tab was closing) dropped the mutation from storage before its request had completed, and a tab that died in that window lost it. Applies to `<PersistQueryClientProvider>` and to `persistQueryClient`, `persistQueryClientRestore`, `persistQueryClientSave` and `persistQueryClientSubscribe`, which keep TanStack's signatures. New export `shouldPersistMutation`; an explicit `dehydrateOptions.shouldDehydrateMutation` still overrides it. Delivery is now at-least-once (a request the server received but whose response never reached the closing tab is sent again), so make mutation endpoints idempotent.
