---
'@pyreon/runtime-dom': patch
---

A throw while hydrating a component's subtree is now contained the way a mount contains it. Before, it escaped `hydrateRoot`: the app got no cleanup back, so effects already hydrated (a sibling's) could never be disposed, and the context owner was left pointing at the component that threw. Now the throwing component's scope stops, the owner is restored, the error goes to the nearest `ErrorBoundary` (or is logged), and hydration continues with the siblings. `hydrateRoot` also restores the context owner on every exit.
