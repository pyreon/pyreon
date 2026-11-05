---
'@pyreon/charts': patch
---

Faster row-object mounts for long series. From 300,000 rows the accessor loop runs row 0 on its own before the rest, so V8 compiles the loop with the current accessor inlined. Before, a compile that started after the previous chart's accessor was garbage-collected called the accessor out of line for every row, and V8 never recompiled it.

Measured in Chromium on the charts-libs benchmark:
- 1,000,000-row line mount: 15.52 → 13.77 ms.
- 100,000-row update: 2.66 → 2.34 ms.

Shorter series keep the single loop, which measured faster below about 300,000 rows. Accessors are still called once per row, in order.
