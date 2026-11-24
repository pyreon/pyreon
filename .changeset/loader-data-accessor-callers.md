---
'@pyreon/compiler': patch
'@pyreon/create-zero': patch
'@pyreon/zero': patch
---

Follow `@pyreon/router`'s `useLoaderData()` accessor (#4814). `diagnose` explains the symptoms of code written for the old value-returning API: a destructure, `data.title` on the accessor, and a value read once in the body that goes stale. The `create-zero` templates and the zero docs read loader data as `data().field`.
