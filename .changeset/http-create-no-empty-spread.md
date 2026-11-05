---
'@pyreon/http': patch
---

`createHttp()` and `extend()` are ~20% faster: the header-source list is copied with `slice()` instead of spreading a fallback empty array.
