---
'@pyreon/vue-compat': patch
---

`defineAsyncComponent`: a failed load is now retried by the next mount, as in Vue 3 (the next `<Suspense>` render or server request that asks for it included). An instance already showing the error keeps showing it, and the `<Suspense>` that held the component when it failed renders the error once rather than retrying, so a permanently failing loader cannot loop.
