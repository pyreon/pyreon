---
"@pyreon/primitives": minor
---

Add `connectWebHost()` — the reusable guest-side glue for the `<WebView>` bridge, the other half of the WebView-host pattern that lets web-only-rich packages (charts / flow / rich-text / code / document) run 1:1 on iOS/Android by hosting the same web bundle inside a native WebView. A bundle calls `connectWebHost()` to read host-pushed props (`data()` / `onData`, fired on every `pyreondata` push) and send events back (`emit` → the host `onMessage`) — identical code on web, iOS, and Android, so it replaces the hand-rolled `window.__pyreonData` / `window.pyreonPostMessage` wiring with one tested implementation.
