---
'@pyreon/query': patch
---

`<PersistQueryClientProvider>` now resumes persisted paused mutations once the cache is restored. A mutation made offline was persisted and hydrated back after a reload, but nothing resumed it when the page loaded while already online (no offline-to-online event fires), so it stayed paused. Register the function with `client.setMutationDefaults(mutationKey, { mutationFn })`; see the new "Offline and installable apps" pattern.
