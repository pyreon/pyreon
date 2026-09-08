---
'@pyreon/flow': minor
---

Keyboard and screen-reader accessibility for `<Flow>` (React Flow parity).

- Nodes and edges are focus stops: `Enter`/`Space` select, the arrow keys
  move a node by 10 units (`Shift`: 100) with one undo entry per press,
  `Delete`/`Escape`/undo shortcuts bubble to the canvas. Opt out per element
  (`focusable: false`), per default (`nodesFocusable` / `edgesFocusable`) or
  wholesale (`disableKeyboardA11y`).
- ARIA: nodes are `role="group"` + `aria-roledescription="node"` with an
  optional `ariaLabel`; edges are named buttons; both are described by
  visually-hidden keyboard instructions; a polite live region announces
  selection changes and keyboard moves. Decorative layers are `aria-hidden`
  and the edge layer is a named group so focusable paths stay exposed.
- The canvas no longer sets an inline `outline: none` (which hid keyboard
  focus); `flowStyles` themes `:focus-visible` and honours
  `prefers-reduced-motion` — `fitView`/`animateViewport`/animated `layout()`
  jump under it (`config.reducedMotion` overrides).
- `<Controls>` buttons carry `aria-label`s and the lock button is a real
  `aria-pressed` toggle (it was a no-op) that freezes pan, zoom and drag.
