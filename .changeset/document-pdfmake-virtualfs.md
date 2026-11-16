---
'@pyreon/document': patch
---

The PDF renderer works with pdfmake 0.3.14, which renamed the instance's `virtualfs` to `sharedVirtualfs`. Both names are accepted, so the supported pdfmake range is unchanged.
