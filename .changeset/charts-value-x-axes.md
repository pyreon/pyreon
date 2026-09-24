---
'@pyreon/charts': patch
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

A second value (or time) x axis maps on web and native: a series with `xAxisIndex: 1` is placed at its own x positions over that axis's domain, whose ticks and title sit on the opposite edge, and the accessible data table prints those positions. Native option charts also lower a value or time x axis at all — `[x, y]` pairs on a shared x — where they previously emitted nothing.
