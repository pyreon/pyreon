---
'@pyreon/hooks': patch
---

`useDatabase().delete(collection, id)` now returns false on iOS and Android when no record has that id, as it already did on the web. Both native runtimes returned true for every delete, so `if (db.delete(…))` took a different branch on a device than in the browser.
