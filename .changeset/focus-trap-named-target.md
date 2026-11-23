---
'@pyreon/hooks': patch
---

`useFocusTrap`'s `initialFocus` with a named target (selector, element or getter) now moves focus even when focus is already inside the trapped container, unless it is already inside that target. A menu button that sits inside the header it traps is focused by its own click, so the container check meant the named target was never focused there (#4355). `initialFocus: true` keeps the old rule and leaves focus that is already inside the container alone.
