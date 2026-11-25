---
'@pyreon/router': patch
---

A navigation that changes only the query or the hash no longer runs a View Transition. Query writes are state bookkeeping (`@pyreon/url-state` through `setUrlRouter`, filters, Atlas syncing its controls), often per keystroke; each one snapshotted and cross-faded the whole document, and in a same-origin iframe it crashed the Chromium renderer.
