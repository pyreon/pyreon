---
'@pyreon/primitives': minor
'@pyreon/hooks': minor
'@pyreon/native-compiler': minor
---

`<WebView>` reports how its page loaded, can retry, and lets a full-screen web view go back in its own history (#4827, #4829).

- `onLoad` runs each time the main frame finishes loading a document (iOS `didFinish`, Android `onPageFinished`, the web `<iframe>`'s `load` event).
- `onError(error: WebViewError)` runs when the main frame fails to load, on iOS and Android: `kind: 'load'` (offline, DNS, refused, TLS), `'http'` (a status of 400 or more; `code` is the status) or `'crash'` (the content process kept dying and the host stopped reloading it). A failed image or XHR and a cancelled navigation are not reported. The web never calls it, because a browser does not tell the parent document that an `<iframe>` failed.
- A changed `reloadKey` loads `html` / `src` again on every target. Setting the same `src` again is not a change, so this is how a failed page is retried.
- `backNavigation` (native) sends Android system Back into the page's history while it has one (a `BackHandler` enabled only while `canGoBack()`, so at the first page Back still pops the route or finishes the activity) and turns on iOS `allowsBackForwardNavigationGestures`. It defaults to `true` for a `grow` view and `false` otherwise.

Behaviour change: a `<WebView grow>` now takes Android Back and the iOS edge swipe for its page history by default. Pass `backNavigation={false}` to keep the old behaviour.

`PyreonWebView` (Swift and Kotlin) gains the `onLoad`, `onError`, `reloadKey` and `backNavigation` parameters, all optional, and the `PyreonWebViewError` type.
