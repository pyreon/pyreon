---
'@pyreon/hooks': patch
'@pyreon/primitives': patch
'@pyreon/native-compiler': patch
---

Android `PyreonWebView` now enables `WebSettings.domStorageEnabled` by default, so `localStorage`/`sessionStorage` work in hosted pages (they threw a `TypeError` before; iOS WKWebView already had them). New `<WebView domStorage={false}>` opt-out (native only, literal value): Android leaves DOM storage disabled, iOS uses a non-persistent data store. Default emit is unchanged; a non-literal `domStorage` warns and keeps the default.
