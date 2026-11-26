---
'@pyreon/atlas': patch
---

The catalog sidebar's rows keep their height when the catalog is longer than the sidebar. The list is a scrolling flex column, and a row with no parts (a bare button) shrank to its line of text, so on `@pyreon/ui-components` (108 components) 52 names were drawn 13px apart and overlapped. The list's rows no longer shrink; the list scrolls instead.
