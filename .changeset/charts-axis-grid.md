---
'@pyreon/charts': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Per-axis grid and minor lines in `@pyreon/charts`: `<Axis y grid={false}>` hides the value-axis lines, `<Axis x grid>` adds vertical lines at the x ticks (the category rows on a horizontal chart), and `<Axis y minor={4}>` / `<Axis x minor>` draw thin lines at equal steps between major ticks on linear axes. `showGrid` keeps meaning what it always did; a chart that sets none of these draws the same lines as before. They lower to iOS and Android as literals.
