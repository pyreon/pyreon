---
'@pyreon/charts': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Line decimation finds each pixel column's end once per column instead of testing every point, and checks for gaps inside that same pass instead of a separate scan first. The output is bit-identical. A 1,000,000-point line given as a column mounts in ~12.5 ms instead of ~14.6 ms in Chromium, now ahead of uPlot; the native chart engines carry the same change.
