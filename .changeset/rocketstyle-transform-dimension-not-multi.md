---
'@pyreon/rocketstyle': patch
---

A dimension declared as `{ propName, transform: true }` (without `multi`) now types its prop as a single value. The prop type treated every object-form dimension as multi-value and accepted an array, while the runtime only treats `multi: true` as multi. Dimensions that declare `multi` are unchanged.
