---
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
'@pyreon/native-compiler': patch
'@pyreon/http': patch
'@pyreon/hooks': patch
'@pyreon/query': patch
---

`@pyreon/http`'s `timeout` lowers to iOS and Android. An endpoint request carries the deadline the web gives it (the call's `timeout`, else the endpoint declaration's, else the client's, else the 30 s default; `false` for none), and a request that runs past it ends in the error state. Before, `timeout` was named and ignored, so native requests waited for the platform default.
