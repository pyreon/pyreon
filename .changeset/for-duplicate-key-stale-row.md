---
'@pyreon/runtime-dom': patch
---

`<For>` no longer leaves a removed row in the DOM when an update both removes a key and duplicates another (for example `[1, 2, 3] → [2, 2, 1]`). The "pure reorder" shortcut compared the number of cached rows to the list length, and a duplicate kept those equal while a key had gone. It now counts the distinct rows the update keeps.
