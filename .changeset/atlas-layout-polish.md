---
'@pyreon/atlas': patch
---

Workbench shell polish. Below 900px the sidebar becomes an overlay drawer and the addon panel a bottom sheet (one-row top bar, icon-only search, keyboard hints hidden on touch). The sidebar opens on its first row, reveals and scrolls to the selected component (expanding collapsed folders), folds a folder named after a component into that component's row, marks the active scenario, and reports the matched count with an empty state while filtering. Addon tabs sit on one scrolling row with inapplicable panels dimmed; control widgets expose `aria-pressed`, `role="switch"` + `aria-checked` and label association. Links only carry non-default state. The ⌘K focus ring, the light-mode preview surface, the Contrast swatch and label casing are fixed, and web fonts load non-blocking with only the weights in use.
