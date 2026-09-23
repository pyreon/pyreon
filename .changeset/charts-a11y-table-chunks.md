---
'@pyreon/charts': patch
---

The accessible data table a chart renders for screen readers is split into
50-row `<tbody>` blocks marked `content-visibility: auto`, so the browser
skips laying out the blocks it doesn't need to show while their rows stay in
the accessibility tree. On a 1,000-point line chart this cut first render from
12.5 ms to 10.4 ms in a back-to-back run.
