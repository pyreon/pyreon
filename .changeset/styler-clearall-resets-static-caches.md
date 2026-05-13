---
'@pyreon/styler': patch
---

`sheet.clearAll()` now resets `styled()`'s `staticComponentCache` (WeakMap of cached `ComponentFn` references) and `_hotCache` (single-entry hot ComponentFn slot) via the new `onSheetClear` subscriber registry. Pre-fix, `clearAll()` flushed the CSSOM rules + dedup cache but left the per-template `StaticStyled` ComponentFn references alive — those closures still returned the OLD class names (now deleted from the DOM), so post-`clearAll()` renders produced markup with class attributes that pointed at nothing. The leak was invisible in normal app shape (apps don't call `clearAll()` in production) but bit HMR cycles + test suites that reset the sheet between cases. Mirrors vitus-labs commit. Scoped to the singleton sheet — `createSheet()` instances don't fire the hook (per-request SSR isolation has no shared subscribers to invalidate).
