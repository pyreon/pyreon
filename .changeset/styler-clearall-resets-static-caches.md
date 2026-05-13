---
'@pyreon/styler': patch
---

`sheet.clearAll()` now resets `styled()`'s `staticComponentCache` WeakMap and `_hotCache` single-entry hot cache via the new `onSheetClear` subscriber registry. Pre-fix, calling `clearAll()` flushed the stylesheet but left the per-component static-VNode and hot-class caches pointing at class names that no longer existed in the sheet — subsequent renders served stale (now-invalid) class strings. The leak was invisible in normal app shape (apps don't call `clearAll()` in production) but bit HMR cycles + test suites that reset the sheet between cases. Mirrors vitus-labs commit.
