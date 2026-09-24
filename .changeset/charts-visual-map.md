---
'@pyreon/charts': minor
---

visualMap component: `visualMap({ domain, … })` builds the strip's spec (`type: 'continuous' | 'piecewise'` with explicit `pieces` or `splitNumber`, colour `stops`, `orient`, end `text`, item size and length), `renderVisualMap` draws it (a 24-stripe ramp strip with end labels, or swatches + labels, vertical or horizontal, reporting its size), and `domainFromSeries` derives a domain from the data.
