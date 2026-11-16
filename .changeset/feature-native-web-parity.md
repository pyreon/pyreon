---
'@pyreon/feature': minor
'@pyreon/query': patch
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

`@pyreon/feature`'s CRUD hooks now behave as the web does on iOS and Android, identically on both:

- A non-2xx answer rejects with the web helper's error, `PyreonHttpMessageError`: `error.message` is the body's non-empty string `message`, else `<METHOD> <url> failed: <status>`, plus `status` and the JSON text of a truthy `errors`. Every lowered request runs through a new `.reject` / `Reject` HTTP middleware that builds it.
- A 204 on `useCreate` / `useUpdate` resolves with no data (status `success`, `data` absent) instead of failing to decode. `PyreonMutation` gains `orEmpty` entry points (`mutate(_:orEmpty:)`, `mutateAsync(_:orEmpty:)`; Kotlin `runOrEmpty` / `runAsyncOrEmpty`) whose callbacks receive the optional value, so read the `onSuccess` data and an awaited `mutateAsync` result with `?.`.
- A record missing a schema field decodes that field to its `initialValues` default on Swift too, as Kotlin already did; Swift's synthesized decode used to fail the whole response.

`<error>.message` on a value typed `Error` (`q.error()?.message`, an `onError` parameter) now compiles on both targets and reads the error's message. Swift's `PyreonHttpError` reads `HTTP <status>` there, as the Kotlin twin does.
