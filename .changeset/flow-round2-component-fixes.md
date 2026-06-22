---
"@pyreon/flow": patch
---

Fix a cluster of `@pyreon/flow` component bugs surfaced by a round-2 review +
a new real-app feature-matrix example. Several were dormant because the
affected components never actually rendered in real Pyreon-compiled apps.

- **MiniMap / Controls never rendered without an explicit `instance` prop.**
  `<Flow>` now injects its instance via a `FlowContext`, so the documented
  `<Flow instance={flow}><MiniMap /></Flow>` shape works (children resolve
  `props.instance ?? useContext(FlowContext)`; an explicit prop still wins).
- **MiniMap threw `setAttribute is not a function`** — the dynamic
  `{nodes.map()}` array between two static `<rect>`s broke the compiler's
  element-ref walk for the trailing reactive `<rect>`. Wrapped the nodes in a
  static `<g>`.
- **Controls threw `replaceChild of null`** — same class: the trailing
  reactive zoom-% `<div>` after the dynamic conditional buttons. Isolated the
  conditionals in a `display:contents` wrapper.
- **Edge markers rendered as `[object Object]`** in real apps — a bare
  `{MarkerGlyph(...)}` call under the `<marker>` parent. Now a real component
  element `<MarkerGlyph/>`.
- **NodeToolbar show-on-select was a static `return null`** — never reacted to
  selection. Now `selected` accepts an accessor and the toolbar mounts /
  unmounts reactively.
- **NodeResizer handle offsets** were hardcoded `-4px` (half the default size)
  — now scale with `handleSize`.
- **Clicking a NodeToolbar button (or any control inside a node) started a node
  drag** and swallowed the click — the node drag now bails on
  `.pyreon-flow-node-toolbar` / `.nodrag` / `button,input,…` targets (React
  Flow `.nodrag` convention).
- **`drag-to-connect` released over a handle never created an edge** — pointer
  capture made `pointerup`'s `e.target` the container; now hit-tests the cursor
  via `document.elementFromPoint`.
- **`getAbsolutePosition` stack-overflowed** on a cyclic / self `parentId`
  (malformed data) — added a visited-set guard.
