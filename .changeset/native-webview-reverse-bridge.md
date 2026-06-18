---
"@pyreon/primitives": minor
---

feat(primitives): `<WebView onMessage>` reverse bridge — the hosted page sends strings back to the host via the unified `window.pyreonPostMessage("…")` API, delivered to the `onMessage` callback. On web the parent defines `window.pyreonPostMessage` on the iframe (same-origin / `srcdoc`); on iOS it's a `WKScriptMessageHandler` and on Android a main-thread-marshalled `@JavascriptInterface` (PMTC-emitted). Enables webview-hosted viz (charts / flow) to drive native signals — e.g. a tapped chart bar updating a native selection.
