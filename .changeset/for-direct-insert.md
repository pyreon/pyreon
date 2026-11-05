---
'@pyreon/runtime-dom': patch
---

`<For>` mounts new rows straight into the live parent on a fresh render, a full replace, and a contiguous insert, instead of staging them in a `DocumentFragment` and moving the fragment in. Staging parented every row twice. Measured in real Chromium on the benchmark row (same build, arms interleaved, CI95 disjoint): 1,000-row create JS 0.99 → 0.905 ms, replace 1.56 → 1.43 ms; 10,000-row create 10.47 → 9.50 ms. A row `ref` now sees its element connected and in its final parent when it runs.
