---
'@pyreon/testing': minor
---

New package `@pyreon/testing` — official testing utilities for Pyreon. This first cut ships the Testing-Library core: `render(ui, options?)` (mounts into an isolated container, returns bound queries + `unmount`/`debug`), `screen` (document-scoped queries), `cleanup()` (unmounts every rendered tree; auto-registerable in `afterEach`), and the `getByText`/`getByTestId` query families (`getBy`/`queryBy`/`getAllBy`/`findBy` variants). Interaction (`fireEvent`/`waitFor`), ARIA-role queries, `renderHook`, jest-dom matchers, and the reactive-native matchers follow in subsequent releases.
