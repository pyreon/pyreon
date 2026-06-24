---
"@pyreon/flow": minor
---

The `<Flow>` canvas is now an accessibly-labeled region. Its container is focusable (`tabindex=0`) and keyboard-interactive, but had no `role` and no accessible name — a screen reader tabbing in hit an unlabeled, unexplained focus stop. It now renders as `role="group"` with an `aria-label` (default `"Flow diagram"`), and a new `ariaLabel` prop overrides it (e.g. `ariaLabel="Pipeline editor"`). No behavior change beyond the added ARIA; the SVG layers already carried their own `role="img"` labels.
