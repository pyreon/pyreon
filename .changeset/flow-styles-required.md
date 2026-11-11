---
'@pyreon/flow': patch
---

`<Flow>`'s screen-reader-only keyboard instructions and live region are now hidden by inline styles, so they no longer render as visible text over the canvas when the optional `flowStyles` sheet is not injected. In development, `<Flow>` warns once per page when `flowStyles` is not loaded (it carries the hover/selection states, animated edges, focus rings and dark-mode variables); the sheet now includes a `--pyreon-flow-styles` marker for that check.
