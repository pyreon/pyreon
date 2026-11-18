---
'@pyreon/charts': patch
---

Chart data props now accept `readonly` arrays. Every family typed its dataset `T[] | (() => T[])` (and its fixed-shape inputs `TreeNode[]`, `GanttTask[]` and so on), so a `readonly X[]` prop, an `as const` literal or an accessor returning `readonly X[]` failed to typecheck. The engine only reads these arrays, so the component props, the `/svg` renderer options and the nested arrays of their element types (a tree's `children`, a task's `dependencies`, a series' `values`, an axis' `categories`, a parallel row) are now `readonly`. Mutable arrays still assign. The generated native chart engine is unchanged.
