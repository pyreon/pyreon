---
'@pyreon/core': patch
'@pyreon/runtime-dom': patch
'@pyreon/head': patch
'@pyreon/reactivity': patch
---

Smaller client bundles: the client no longer ships the ~160-name event-handler list. `runtime-dom` and `@pyreon/head`'s DOM syncer now ask the element which lowercase `on*` names are real handlers (`key in el`, new `isElementEventHandlerAttr` export) — the engine's exact answer — while SSR keeps the list. The template cache is a plain FIFO `Map` (drops the `@pyreon/sized-map` dependency), and a signal's production read closure no longer carries a dev-only rest parameter. The krausest-style table app bundle goes from 16.6 KB to 15.7 KB gzipped.
