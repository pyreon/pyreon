---
'@pyreon/testing': patch
---

Fix `render()` failing to find portaled content. Bound queries (`getByRole`, `getByText`, …) now resolve from `baseElement` (`document.body` by default) instead of the mount container — matching `@testing-library/react`. Pyreon `<Portal>` / Overlay / Modal / Toast / Dropdown render OUTSIDE the container (into `document.body`), so container-scoped queries silently failed to find any modal/overlay/tooltip. Scope to a single tree with `within(result.container)` when needed.
