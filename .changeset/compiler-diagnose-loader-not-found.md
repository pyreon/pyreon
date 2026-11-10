---
'@pyreon/compiler': patch
---

`diagnoseError` recognises the pre-fix symptoms of a loader's `notFound()` answering HTTP 500 (`SSR render failed … Error: Not Found`, `data endpoint returned HTTP 500`) and explains the upgrade and the `_404.tsx` page.
