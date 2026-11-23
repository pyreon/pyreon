---
'@pyreon/hooks': patch
---

Android `<WebView>`: a renderer process that crashes or that the system kills no longer takes the whole app down. `PyreonWebView` now handles `onRenderProcessGone`: it drops the dead WebView and composes a new one that loads the page again. A page that keeps crashing its renderer is reloaded twice, then the host stays empty and logs a `[Pyreon]` warning saying why.
