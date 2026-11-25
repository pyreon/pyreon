---
'@pyreon/hooks': patch
---

`useFocusTrap`'s `initialFocus` with a named target (selector, element or getter) now also moves focus when focus is already inside the trapped container, if this is the first activation or the activation ran inside a user event at the focused element: a menu button inside the header it traps is focused by its own click, and the old container check meant the named target was never focused there (#4355). A trap that re-arms while the user works inside (for example `active: () => open() && !saving()`) still leaves focus alone, and focus already inside the target is never moved. `initialFocus: true` keeps the old rule.
