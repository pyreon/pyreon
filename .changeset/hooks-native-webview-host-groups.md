---
'@pyreon/hooks': patch
---

Native `PyreonWebView` (Swift + Kotlin) speaks the `<WebView>` host-group protocol: reserved join/leave/relay messages are consumed before `onMessage`, and a relay is evaluated into every sibling WebView of the same group. Members are held weakly and removed by identity on leave, dismantle/release and deinit.
