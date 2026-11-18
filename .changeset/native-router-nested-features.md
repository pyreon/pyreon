---
'@pyreon/native-compiler': patch
'@pyreon/native-router-swift': patch
'@pyreon/native-router-kotlin': patch
'@pyreon/router': patch
---

Native routers: a router with a nested layout route no longer drops its redirects (the path fell through to the 404 page) or its route loaders, and the wildcard is only the fallback branch. A parameterless `beforeEach` / `afterEach` function compiles on iOS and Android. `useRouter()` lowers to a handle with `push`, `replace`, `back` and `forward`.
