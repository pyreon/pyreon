---
'@pyreon/native-compiler': patch
---

`<OptionChart>` lowers polar scatter / effectScatter series, and a polar option with no radius extent now emits a typed `PolarAxes` (a `categories`-only literal used to become an untyped object neither toolchain accepted).
