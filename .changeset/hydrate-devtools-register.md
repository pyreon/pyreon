---
'@pyreon/runtime-dom': patch
---

`hydrateRoot` registers every hydrated component with the devtools hook (`window.__PYREON_DEVTOOLS__`), with its parent and its own first element, and unregisters it on unmount. SSR, SSG, island and Zero apps no longer show an empty Components tree. A component mounted later under a hydrated one is registered under it, and async components are registered on both the mount and the hydration path. Development only; production bundles are unchanged.
