---
'@pyreon/flow': patch
---

On Android, custom edges and custom connection lines drawn with `<path>` now render at the right size. They were drawn in pixels instead of dp, so they came out smaller by the screen density (about 2.6× on a typical phone) and landed in the wrong place. The built-in edges were already correct, and iOS was unaffected.
