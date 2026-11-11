---
'@pyreon/charts': patch
---

A server-rendered chart (with `@pyreon/charts/svg` imported on the server) now hydrates in place in a real browser. The canvas paints while it is hydrated, and the server's first-frame element after it was removed from its own ref while the hydration walk was still on it: the walk then found no next sibling, logged a hydration mismatch, and mounted the tooltip, the live region and the accessible table a second time. The frame is now removed after the hydration pass.
