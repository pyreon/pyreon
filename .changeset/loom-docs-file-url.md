---
'@pyreon/loom': patch
---

Docs only: the `loom build` documentation no longer claims the site works opened from `file://`. It has to be served over HTTP: from `file://` the browser blocks its module scripts, and a relative `--base ./` does not help. `--base` is documented as an absolute public path. The sample `loom scan` output is updated to a real scan of this repository.
