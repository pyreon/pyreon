---
'@pyreon/runtime-dom': patch
---

Fix delegated event handlers firing twice when delegation roots are nested — the islands "+2 per click" double-fire. In a `@pyreon/zero` app an island self-hydrates via `hydrateRoot(islandMarker)`, installing a second event-delegation root *inside* the app's mount root; a click on the island's button was then walked by both roots' listeners, so its `onClick` ran twice. The delegated listener now tags the (shared) event object with the set of elements already invoked for that dispatch, so an outer root skips any element an inner root already handled. Single-root delegation (the common case) is unchanged and stays zero-alloc on the no-handler walk.
