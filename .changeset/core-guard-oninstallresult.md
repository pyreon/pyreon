---
'@pyreon/core': patch
---

The event-handler attribute guard also covers `oninstallresult`, an event-handler property that Chromium 159 added. Writing it as an attribute is refused like every other handler name.
