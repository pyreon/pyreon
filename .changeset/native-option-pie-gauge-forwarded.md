---
'@pyreon/native-compiler': minor
'@pyreon/charts': minor
---

The engine gains a `frame` module that resolves a chart's placement (`center`, `radius` and the box keys) at the device's own size; the web uses the same function, so the two targets place a chart identically. `renderDial` takes an optional palette, and the new `renderDialIn`, `pieHitWith` and `pieTipWith` are shared by web and native.
