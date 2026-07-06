---
'@pyreon/testing': minor
---

`@pyreon/testing` is now a thin adapter over `@testing-library/dom` (the shared foundation under the React/Vue/Solid/Svelte testing libraries) instead of a from-scratch reimplementation. `render` mounts a Pyreon component and binds the full `@testing-library/dom` query set to it; `screen`, `fireEvent`, `waitFor`, `within`, `prettyDOM`, and every query (`getByRole` with real ARIA + accessible-name resolution, `getByText`, `getByLabelText`, `getByTestId`, …) are re-exported verbatim — so the entire Testing-Library API works exactly as you know it, with the ecosystem's battle-tested edge-case handling. This matches how every Pyreon adapter package is built (`@pyreon/query` wraps TanStack, `@pyreon/dnd` wraps pragmatic-drag-and-drop). `fireEvent` through Pyreon's event delegation is verified in a real browser.
