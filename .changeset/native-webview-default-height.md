---
'@pyreon/hooks': patch
---

An unsized native `<WebView>` now defaults to 150 points tall on iOS and Android, matching the CSS default the web `<iframe>` falls back to. Before, it measured to its content. For a hosted chart or flow page whose body is `height: 100%`, that came out around 18dp inside a scrolling page, so the page had no room to lay out and taps landed on nothing. An explicit height still takes precedence.
