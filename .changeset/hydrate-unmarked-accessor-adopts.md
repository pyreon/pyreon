---
'@pyreon/runtime-dom': patch
---

Hydration adopts the server nodes under a reactive child that the server rendered without one (for example `props.children` on the server and `<Provider>{props.children}</Provider>` on the client). It used to remove one server node and mount the subtree again with no warning, and a child of several nodes also re-created the element after it. A real difference inside is now reported through `onHydrationMismatch` like any other.
