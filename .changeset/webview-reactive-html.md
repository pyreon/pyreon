---
'@pyreon/primitives': patch
'@pyreon/flow': patch
'@pyreon/charts': patch
'@pyreon/code': patch
'@pyreon/rich-text': patch
---

A changed `html` now reloads a web-hosted page, as it already did on iOS and Android. The web `<WebView>` and the `FlowWebView`, `ChartWebView`, code and rich-text wrappers each read `html` once at setup, so a reactive swap kept the first page running forever. The new document gets the reverse bridge and the current `data` on load, the same as the first one.
