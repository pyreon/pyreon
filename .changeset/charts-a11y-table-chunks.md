---
'@pyreon/charts': patch
---

The accessible data table a chart renders for screen readers now builds its
rows into 50-row `<tbody>` blocks instead of one. On a 1,000-point line chart
that cut first render from 12.5 ms to 10.4 ms in a back-to-back run. Every row
stays in the accessibility tree; a browser spec reads Chromium's tree to hold
that.
