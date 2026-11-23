---
'@pyreon/runtime-dom': patch
---

A `<For>` that hydrates over server output it cannot read as its own block no longer leaves a stray `<!--pyreon-for-->` comment behind. This happens, for example, when a divergent sibling before the list leaves the hydration cursor on a stale server node. The list mounts fresh as before and stays live.
