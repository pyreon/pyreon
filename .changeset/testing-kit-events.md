---
'@pyreon/testing': minor
---

`@pyreon/testing` gains interaction + more queries: `fireEvent` (dispatches bubbling events so Pyreon's event delegation actually fires the handler — a non-bubbling dispatch would silently no-op), `waitFor(cb, opts?)` (polls until the callback stops throwing), and the `getByRole` (implicit + explicit ARIA roles, narrowable by accessible `name`), `getByLabelText`, and `getByPlaceholderText` query families.
