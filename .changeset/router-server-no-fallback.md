---
'@pyreon/router': patch
---

Router hooks no longer read another request's router during server rendering. `<RouterProvider>` also stored its router in a module-level fallback, and the hooks used it when no provider was above them. On a server that slot held the last page request's router, so a server-island fragment (rendered without a provider) saw another user's path and query through `useRoute()`, `useParams()` or `useSearchParams()`. The fallback is now client-only: on a server `setActiveRouter` stores nothing and the hooks resolve through `<RouterProvider>` context alone, throwing the usual "no router installed" error otherwise.
