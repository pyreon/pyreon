---
'@pyreon/primitives': minor
---

`<WebView>` host groups. A hosted page may post the reserved `__pyreonWebViewGroup` messages (join / leave / relay) through the existing `pyreonPostMessage` channel; the host consumes them (they never reach `onMessage`) and fans a relayed string into every other hosted page of the same group via `window.__pyreonWebViewGroupMessage`. `connectWebHost()` gains `joinGroup` / `leaveGroup` / `relay` / `onRelay`, and `parseWebHostGroupMessage` is exported for hosts. The reverse bridge is now always installed on web, matching the native hosts.
