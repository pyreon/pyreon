---
'@pyreon/http': patch
'@pyreon/lathe': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

A path parameter whose value is exactly `.` or `..` is now encoded as `%252E` / `%252E%252E`. `encodeURIComponent` left it intact and the URL parser (fetch, OkHttp) resolves it — and `%2E` — as a dot segment, so the request, credentials included, reached a different endpoint. Applied identically by `@pyreon/http` (new export `encodePathParam`, used by `applyPathParams` and the native compile-time literal path), the iOS/Android `PyreonURL.encodePathParam`, and lathe's generated client runtime. Every other value is unchanged.
