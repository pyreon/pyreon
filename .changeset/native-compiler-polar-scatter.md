---
'@pyreon/native-compiler': patch
---

A polar chart with no radius extent now emits a typed `PolarAxes` natively (a `categories`-only literal used to become an untyped object neither toolchain accepted).
