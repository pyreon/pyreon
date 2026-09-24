---
'@pyreon/charts': patch
---

fix(charts): `paintCached` dropped the RTL mirror

**`paintCached` dropped the RTL mirror.** `canvasHost` has two paint paths and
only `draw()` applied the presentation transform. `paintCached` runs on every
tick of the update tween, on each arrow key, on Escape and on blur — so an RTL
chart un-mirrored on the first keypress, and a data change painted frame 0
mirrored and every later frame unmirrored, SETTLING unmirrored while the pointer
seam kept mirroring. `present` now lives above both paths and both go through it.

The file is new this cycle, so the bug never shipped.
