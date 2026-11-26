---
'@pyreon/native-runtime-kotlin': patch
'@pyreon/primitives': minor
'@pyreon/hooks': minor
'@pyreon/native-compiler': minor
---

`<WebView>` reports how its page loaded, can retry, and lets a full-screen web view go back in its own history (#4827, #4829).

- `onLoad` runs each time the main frame finishes loading a document (iOS `didFinish`, Android `onPageFinished`, the web `<iframe>`'s `load` event).
- `onError(error: WebViewError)` runs when the main frame fails to load, on iOS and Android: `kind: 'load'` (offline, DNS, refused, TLS), `'http'` (a status of 400 or more; `code` is the status) or `'crash'` (the content process kept dying and the host stopped reloading it). A failed image or XHR and a cancelled navigation are not reported. The web never calls it, because a browser does not tell the parent document that an `<iframe>` failed.
- A changed `reloadKey` loads `html` / `src` again on every target. Setting the same `src` again is not a change, so this is how a failed page is retried.
- `backNavigation` (native) sends Android system Back into the page's history while it has one (a `BackHandler` enabled only while `canGoBack()`, so at the first page Back still pops the route or finishes the activity) and turns on iOS `allowsBackForwardNavigationGestures`. It defaults to `true` for a `grow` view and `false` otherwise.

- A new `html`, `src` or `reloadKey` starts a new history (Android clears it when the new page commits; iOS creates a new WKWebView), so Back never returns to a page the app replaced. `onLoad` runs once per document on both platforms (not for an in-page `#hash` or `pushState` navigation), and iOS no longer reports WebKit 204 (a media URL handed to the player) as an error.
- `WebViewError` is declared in both native runtimes (an alias of `PyreonWebViewError`), so a named handler annotated with it compiles.

`@pyreon/native-runtime-kotlin`: content that `<Tabs>` and `<Split>` keep composed while hidden no longer receives system Back. A hidden tab's web view, or its split view's handler, used to take Back from the visible tab's route stack. The hidden content gets both a detached `OnBackPressedDispatcher` and a disabled child `NavigationEventDispatcher`, because since activity-compose 1.12 `BackHandler` registers with the navigation-event dispatcher.

Behaviour change: a `<WebView grow>` now takes Android Back and the iOS edge swipe for its page history by default. Pass `backNavigation={false}` to keep the old behaviour.

`PyreonWebView` (Swift and Kotlin) gains the `onLoad`, `onError`, `reloadKey` and `backNavigation` parameters, all optional and after `onDownload` / `saveDownloads`, and the `PyreonWebViewError` type. On iOS a main-frame response with a status of 400 or more is reported as `kind: 'http'` and is never treated as a download.
