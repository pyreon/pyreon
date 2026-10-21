---
'@pyreon/native-runtime-kotlin': patch
'@pyreon/hooks': patch
'@pyreon/query': patch
'@pyreon/native-compiler': patch
---

Android: `useFetch` and `useQuery` requests with a method, headers or a body now work with no setup. They used to throw `NoExecutor` in any app that did not call `PyreonHttp.install(PyreonHttpOkHttp)` itself, and a scaffolded app does not. The generated code now passes the bundled OkHttp executor as a fallback (`PyreonHttp.send(request, fallback = PyreonHttpOkHttp)`); an installed executor still wins. The fallback is a direct reference rather than reflection, so R8 keeps it in minified release builds.
