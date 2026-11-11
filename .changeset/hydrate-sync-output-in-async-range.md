---
'@pyreon/runtime-dom': patch
---

Hydration now adopts an `island()` rendered inside a fully hydrated page instead of replacing it.

On the server an island is async, so its HTML sits between `<!--$pas-->` and `<!--$pae-->`. On the client it returns its `<pyreon-island>` marker synchronously. Hydration used to compare that marker against the `<!--$pas-->` comment, report `Hydration mismatch (tag): expected pyreon-island, got 8`, and mount an empty island in its place. The demo then stayed blank until the island's own trigger fired. Now a synchronous output hydrates inside the server's range, and the page continues after the range. This covers any component that is async on the server and synchronous on the client, including one rendered from a compiled template.
