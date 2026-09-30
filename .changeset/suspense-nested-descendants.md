---
'@pyreon/core': minor
'@pyreon/runtime-dom': minor
'@pyreon/solid-compat': minor
'@pyreon/vue-compat': minor
---

`<Suspense>` now shows its fallback for an async descendant at ANY depth, not only its direct child — the React / Vue model. A still-loading `lazy()` (core, react/preact/solid-compat) or suspensible `defineAsyncComponent`, or an `async function` component, registers with the nearest boundary. While it waits the boundary's content stays mounted off-screen (moved into a detached fragment, not torn down), so its ancestors keep their DOM and state and set up once; a descendant that starts loading after the boundary resolved brings the fallback back the same way. An inner `<Suspense>` catches its own descendants. Hydration never shows a fallback over server content. On the client a `<Suspense>`'s output is bracketed by two comment markers.
