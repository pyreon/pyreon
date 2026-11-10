---
'@pyreon/hooks': minor
'@pyreon/primitives': patch
---

Native `<WebView>` hosts scope `data` and the message bridge to the page the app loaded. iOS and Android pin the origin the host's own load lands on (after redirects); the main frame stays on it (a tapped link elsewhere opens in the system browser, any other off-origin navigation is cancelled), and `data` pushes, host-group relays and `onMessage` traffic reach only the main frame of that origin, never an iframe. Android turns off file, content and file-URL universal access, its bridge requires a per-view token that only the main-frame shim holds, and a bundled `src` with a `..` segment, a scheme or a backslash is refused on both platforms (any other `src` must be `http(s)`). Behaviour change: a hosted page can no longer navigate its main frame to another origin after it loads.
