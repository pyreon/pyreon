---
'@pyreon/compiler': patch
---

`CHARTS_ROOT_NAMES` (the `@pyreon/charts` 0.51 → 0.52 migration name table) was missing `date` and `formatDate`, both real exports of the package's main entry — so `detectPyreonPatterns`'s charts-migration sync test would have flagged a name the new entry legitimately exports, and a false positive there is exactly the class this table exists to prevent (telling a user to rewrite working code). Added both names in their sorted position.
