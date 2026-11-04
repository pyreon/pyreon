---
'@pyreon/router': patch
---

A tab bar inside a layout route now works. `<Tabs router>` (or `router.withTab()`) placed inside a parent route's component, such as a zero `_layout.tsx`, started each tab's `<RouterView>` at depth 0, so every tab rendered the layout again inside itself, recursively, until the page ran out of memory. A tab's first view now sits one level below the views that enclose the tab bar.
