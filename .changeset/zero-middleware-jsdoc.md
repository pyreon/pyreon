---
'@pyreon/zero': patch
---

Documentation only: the `ZeroConfig.middleware` doc comment said middleware passed to `zero({ middleware })` is applied to every route. It is not: middleware is code and cannot cross into the server bundle, so the option is dropped with a build warning. The comment now says so and points to `createServer({ middleware })`.
