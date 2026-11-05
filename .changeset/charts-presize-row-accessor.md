---
'@pyreon/charts': patch
---

Charts given row objects (`data: [{ … }]` with an accessor mark) resolve each accessor into a presized array instead of growing one with `push`. An earlier release described this change, but the code never made it. At 1,000,000 points a line mount is 14.06 → 10.39 ms on a fresh page in Chromium, and 16.55 → 15.65 ms on the charts-libs board, where the CIs overlap. A 100,000-point update is 2.83 → 2.66 ms. Results are unchanged: non-finite values are still gaps, and numeric strings are still coerced with a warning.
