---
'@pyreon/loom': patch
---

The published package now includes `app/`, the zero app `loom build` builds (without a dev server's `app/.pyreon/`). It was missing from `files`, so `loom build` from an npm install failed with "could not locate the observatory app".
