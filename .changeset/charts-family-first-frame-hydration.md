---
'@pyreon/charts': patch
---

Hydrating a server-rendered pie, sankey, treemap or any other non-plot chart no longer mounts a second tooltip, live region and accessible table. The family host removed the server's first-frame element from inside its own ref, while hydration was still on it; it now removes it in a microtask, as the plot host already did.
