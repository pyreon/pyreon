---
'@pyreon/flow': patch
---

Give native handles, resizers, and edge-reconnect controls independent accessibility frames and platform-sized hit targets so assistive technology and touch gestures can target them reliably.

The Compose hit targets' 48 minimum is a DP floor: it is converted to px before dividing by the zoom, so a 420-dpi device gets a 48dp target rather than 48px (18dp).
