---
'@pyreon/flow': patch
---

`instance.config` no longer holds the initial `nodes` and `edges` arrays, which are read once at creation. Keeping them pinned every initial node and edge for the instance's lifetime, including ones later removed.
