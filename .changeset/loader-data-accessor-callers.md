---
'@pyreon/compiler': patch
'@pyreon/create-zero': patch
'@pyreon/zero': patch
'@pyreon/native-compiler': patch
---

Follow `@pyreon/router`'s `useLoaderData()` accessor (#4814). `diagnose` explains the symptoms of code written for the old value-returning API: a destructure, `data.title` on the accessor, and a value read once in the body that goes stale. The `create-zero` templates and the zero docs read loader data as `data().field`.

Native (PMTC): a bare signal, computed or `useLoaderData()` accessor passed to a component prop typed `() => T` is now wrapped in a closure (`C(d: { data })`), where it used to emit a Swift/Kotlin type error. `data.field` on the loader accessor and `useLoaderData<T>()()` (the accessor called where it is made) warn with the fix: bind it once and read `data().field`.
