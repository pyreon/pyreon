---
'@pyreon/rocketstyle': patch
---

Each rocketstyle component now merges its local context with its props and drops the reserved styling keys in one pass, instead of building a merged copy and then copying it again. The resulting props object is identical.
