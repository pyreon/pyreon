---
'@pyreon/charts': minor
---

Gaps and technical indicators. A non-finite series value is now a GAP: lines and areas break into runs at the gap (ECharts' `connectNulls: false`), points draw nothing there, and derived domains ignore it — the option facade maps `null` and `'-'` data to gaps silently instead of zeroing with a warning. `Mark.transform` derives a whole series from the resolved values, and `sma`, `ema`, `bollinger` (three marks: upper/middle/lower) and `trend` (least squares) ship as line marks whose warm-up positions are gaps, so an indicator starts where it is defined. Pure, Double-only math — lowers to native.
