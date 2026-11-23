---
'@pyreon/hooks': patch
---

`<WebView>` recovers when its page's process dies. On Android, a renderer process that crashes or that the system reclaims no longer takes the whole app down: every WebView the runtime creates (including the throwaway view behind `window.open`, now also destroyed after 10 s when the page never names a URL) handles `onRenderProcessGone`, and the host replaces the dead view and loads the page again. On iOS, a terminated web content process no longer leaves the view blank for good: the host loads the page again. On both, losses less than 60 s apart back off (1 s doubling to 30 s), and after the third crash in a row the view stays empty until its `html` / `src` changes, with a `[Pyreon] <WebView>` warning.
