---
'@pyreon/testing': patch
---

`@pyreon/testing` — finish the Testing-Library-parity story. The `fireEvent` /
`waitFor` / `renderHook` / jest-dom-matcher surface shipped in prior releases;
this hardens the real-Chromium coverage the parity bar requires (happy-dom can't
exercise real event dispatch, visibility, or focus):

- `fireEvent` is now proven through **both** halves of Pyreon's event model in a
  real browser: delegated events (`click`/`input`/`change`/`keyDown`/`submit`/
  `pointerDown`/`dblClick`/`focusIn`) that must bubble to the mount-container
  delegation root, AND non-bubbling events (`focus`/`blur`/`mouseEnter`/
  `mouseLeave`) that reach Pyreon's direct `addEventListener`. Also locks the
  `preventDefault → false` boolean return and the generic `fireEvent(el, event)`
  / `createEvent` form.
- `waitFor` is proven to resolve on a signal-driven DOM change AND to **reject**
  on timeout (not hang); `waitForElementToBeRemoved` is covered.
- `renderHook` reactive-value + `rerender` semantics are locked in a real mount.
- The full jest-dom matcher set (`toBeVisible`/`toHaveFocus` — real
  `getComputedStyle`/`activeElement`, `toBeDisabled`/`toBeEnabled`/`toBeChecked`/
  `toHaveValue`/`toHaveClass`/`toHaveAttribute`/`toHaveTextContent`/
  `toBeInTheDocument`/`toBeEmptyDOMElement`) is exercised in real Chromium, each
  passing on the true case and throwing on the false case.

Docs/README updated to reflect the now-complete surface (the "landing across
follow-up PRs" caveat is removed).
