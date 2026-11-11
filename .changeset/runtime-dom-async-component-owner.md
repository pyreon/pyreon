---
'@pyreon/runtime-dom': patch
---

Async function components keep their ancestors' context on the client (#4377). The subtree an async component resolves to is mounted or hydrated in a later microtask, which had no context owner. Every `useContext()` in that subtree returned the context's default, including contexts the async component itself provided before its first `await`. The microtask now re-enters the component's scope. The mount path also restores the parent context owner as soon as it returns, so the async component's siblings no longer resolve context through it. Hydrating that subtree now runs inside the hydration walk, so a `<Suspense>` in it keeps the server content of a still-loading lazy child instead of showing its fallback.
