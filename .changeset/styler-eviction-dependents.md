---
'@pyreon/styler': patch
'@pyreon/unistyle': patch
---

Fix unstyled elements after the style sheet evicts rules. Past its bound (10,000 rules) the sheet dropped its oldest rules while styled's class caches, static components, CPSE's shape cache, `@keyframes` and static globals kept handing out the evicted names — on the server, later requests shipped class names with no CSS. The sheet now never evicts a class an element in the document still carries (the client pass runs after the current render attaches), a `@keyframes`, a static global, or a mounted dynamic global, and every cache above the sheet re-inserts a rule it finds evicted (`sheet.isLive`). Also key styled's `$element` class cache on the theme, so a theme swap or a second server tenant no longer reuses a class resolved under another theme. Adds `sheet.isLive(name)` and `sheet.retain(key)`; `sheet.insertGlobal` now returns its key.
