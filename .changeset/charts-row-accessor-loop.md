---
'@pyreon/charts': patch
---

Charts given row objects (`data: [{ … }]` with an accessor mark) resolve each accessor in a dedicated loop that writes into a presized array and skips the number-coercion call for numeric results. A 1,000,000-point line mounts about 11% faster (21.2 → 18.8 ms in Chromium) and a 100,000-point update about 40% faster (4.3 → 2.5 ms). Results are unchanged: non-finite values are still gaps and numeric strings are still coerced with a warning.
