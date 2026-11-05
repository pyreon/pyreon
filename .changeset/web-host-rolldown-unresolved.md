---
'@pyreon/native-compiler': patch
---

`bundleWebHostScript` no longer builds a broken web-host page through rolldown when an entry import resolves nowhere. Rolldown treats an unresolved import as external, so the build used to succeed with a page that referenced a global that does not exist, and the failure only showed up as a `ReferenceError` inside the native `<WebView>`. That shape now fails the build and names the import and the directories it searched, which is what the esbuild path already did.
