---
'@pyreon/hooks': minor
'@pyreon/primitives': minor
'@pyreon/native-compiler': minor
'@pyreon/flow': minor
'@pyreon/code': minor
'@pyreon/rich-text': minor
'@pyreon/create-multiplatform': patch
---

`<WebView>` now hosts a whole web flow on iOS and Android: the page gets the browser chrome it would get in a browser, and the view can fill the screen.

Browser chrome (#3982). The Android host had no `WebChromeClient`, so a hosted page's `<input type="file">` never opened a picker, `navigator.geolocation` was never answered, `alert()` / `confirm()` / `prompt()` showed nothing, and `getUserMedia` was denied. The iOS host had no `WKUIDelegate`, so the dialogs were dropped and `window.open` / `target="_blank"` did nothing. Both now answer all of them: the system file chooser (on Android the document picker, or the camera for `capture`), native dialogs titled with the page's host, a per-site prompt for location / camera / microphone followed by the runtime permission, and `http(s)` / `mailto` / `tel` / `sms` links from `window.open` / `target="_blank"` handed to the system browser instead of replacing the hosted page. Location, camera and microphone are only granted when the app declares them (Info.plist usage string, AndroidManifest permission); an undeclared one is refused, and Android logs the entry to add. The `create-multiplatform` scaffold now declares the FileProvider the camera writes through, and lists the permissions and usage strings commented out.

Sizing (#3956, item 5). An unsized `<WebView>` is now the `<iframe>` default on every target: full width and 150 high. iOS used to fill whatever a stack offered while Android was 150dp, and the web filled a sized container. The new `grow` prop takes the free main-axis space of the parent `<Stack>` / `<Inline>` (Compose `Modifier.weight(1f)`, a greedy SwiftUI frame, `flex: 1 1 150px` on the web) and fills a non-stack parent. Inside a `<Scroll>` there is no free space, so the compiler drops `grow` with a named warning. `<CodeWebView>`, `<RichTextWebView>` and `<FlowWebView>` forward `grow` too.

Breaking for apps that relied on the old defaults: on iOS an unsized `<WebView>` in a stack is no longer stretched to fill it, and on the web the iframe no longer has `height: 100%`. Add `grow` where a web view should fill its parent.
