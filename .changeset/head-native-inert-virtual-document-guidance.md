---
"@pyreon/head": minor
"@pyreon/virtual": patch
"@pyreon/document": patch
"@pyreon/native-compiler": patch
---

`@pyreon/head` now compiles for iOS and Android. A native app has no document `<head>`, so `useHead(...)` lowers to nothing and `<HeadProvider>` is transparent: shared source that sets a page title for the web build builds natively instead of failing on a web-only import. The head context and the server-render helpers have no native equivalent and still warn by name. New `./native-plugin` entry.

`@pyreon/virtual` and `@pyreon/document` stay web-only, but their native warning now names the route: `@pyreon/virtual` points at `<Scroll>` with a lone `<For>` child (LazyVStack on iOS, LazyColumn on Android, verified by a regression spec that also compiles it on both toolchains, and by the existing warning for the nested shape Compose rejects at measure time), and `@pyreon/document` points at fetching the file from a server or handing it to the share sheet.
