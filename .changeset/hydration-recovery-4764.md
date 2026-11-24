---
"@pyreon/runtime-dom": minor
"@pyreon/compiler": minor
---

Compiled refs now run after their element's children and attributes, as `h()` refs do, and a `ref` passed inside a spread (`<div {...props}>`) follows the same order (#4764). A ref that cleared its element made a client mount throw when the template had a slot placeholder, a static child overwrote what a ref added, a ref read an empty computed `class`, and during hydration a ref saw server content before it was adopted.

Migration: a compiled ref (literal or spread-carried) that read its element's children or attributes used to see the template's placeholders and the attributes not yet computed; it now sees the mounted content, as on the `h()` path. A child's ref fires before its parent's. In a compiled template every ref fires once the whole template is built. Layout reads still belong in `onMount`. Recompile libraries that ship compiled output: `_applyProps` / `_bindSpread` without the new third argument keep the old immediate ref.

Hydration also recovers from a server/client divergence without leaving its range:

- A `<For>` whose server block is missing no longer deletes past its range. Inside a reactive range it took the range's boundary and every later sibling, and hydration threw.
- An accessor, a `<For>` or a static element after a divergent static child adopts its own server output (rows and typed inputs keep their identity) instead of taking the stale node as content and re-creating the later siblings.
- A compiled slot holding a static value removes the server nodes the value did not claim.
- A client value longer than its server range keeps its extra nodes inside the range.
