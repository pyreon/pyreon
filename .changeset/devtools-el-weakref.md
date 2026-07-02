---
'@pyreon/runtime-dom': patch
---

Dev-mode devtools registry no longer pins detached DOM: `DevtoolsComponentEntry.el` is now backed by a `WeakRef` getter. The registry captures a component's first element once at mount — when a reactive re-render later replaced the component's DOM (component still mounted, so `unregisterComponent` never fires), the strong ref pinned the detached original subtree for the component's whole lifetime (found via a real downstream heap snapshot: detached `metric-card` trees retained through `_components → entry → el`). Reads are unchanged for live elements; replaced elements become GC-eligible immediately. Zero production impact (the registry is `__DEV__`-only).
