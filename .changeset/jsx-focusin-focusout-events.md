---
'@pyreon/core': minor
'@pyreon/toast': patch
---

Add `onFocusIn` / `onFocusOut` JSX event types; Toaster pauses on keyboard focus

- **`@pyreon/core`**: the JSX event surface now types `onFocusIn` / `onFocusOut`
  — the **bubbling** focus events (unlike the non-bubbling `onFocus` / `onBlur`),
  so a handler on a container fires when focus moves to/from any descendant.
  The runtime already delegated these events (`onFocusIn` → `focusin` via the
  generic `on*` lowercasing + `DELEGATED_EVENTS`); only the types were missing.
- **`@pyreon/toast`**: the Toaster now mirrors its pause-on-hover with
  **pause-on-focus** (`onFocusIn` / `onFocusOut`), so a keyboard user tabbing
  into a toast (e.g. its close button) pauses auto-dismiss the same way a mouse
  user does on hover.
