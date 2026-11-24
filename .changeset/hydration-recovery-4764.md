---
"@pyreon/runtime-dom": patch
"@pyreon/compiler": patch
---

Hydration recovers from a server/client divergence without leaving its range (#4764):

- A `<For>` whose server block is missing no longer deletes past its range. Inside a reactive range it took the range's boundary and every later sibling, and hydration threw.
- An accessor or `<For>` after a divergent static child adopts its own server output (rows keep their identity) instead of taking the stale node as content and re-creating the later siblings.
- A compiled slot holding a static value removes the server nodes the value did not claim.
- A client value longer than its server range keeps its extra nodes inside the range.

Compiled refs now run after their element's children, as `h()` refs do. A ref that cleared its element made a client mount throw when the template had a slot placeholder, a static child overwrote what a ref added, and during hydration a ref saw server content before it was adopted.
