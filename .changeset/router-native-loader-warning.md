---
'@pyreon/router': patch
---

The native compiler no longer warns on every `useLoaderData<T>()` that auto-running a route's `loader` is "future work". Route loaders have run natively for some time: an expression-body `loader` fires on the route's first appear and stores its result where `useLoaderData` reads it. A loader shape that can't be lowered still warns at the route itself. The destructured form `const { … } = useLoaderData<T>()` still warns, because it is not emitted yet.
