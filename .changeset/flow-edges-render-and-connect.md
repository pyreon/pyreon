---
"@pyreon/flow": patch
---

fix(flow): edges now visually render + connect, and Controls buttons work

Three coupled bugs meant flow edges never actually painted and the zoom/fit
buttons did nothing — all found by looking at the rendered pixels, not just the
DOM (the existing e2e counted `<path>` elements + geometry length, which pass
even when nothing is drawn).

- **Zero-area edge svg → invisible edges.** The `.pyreon-flow-viewport` div is
  absolutely positioned and shrink-to-fit, so it collapsed to 0×0 and the edge
  `<svg width/height:100%>` resolved to 0×0. A zero-area svg viewport paints
  none of its content, so every edge path existed in the DOM with correct
  geometry yet rendered nothing. Fixed by sizing the viewport `100%` (React
  Flow's model) with `overflow: visible`.
- **Node auto-measurement.** Edge geometry fell back to a `150×40` node size when
  `node.width`/`height` weren't set, starting edges ~70px off content-sized
  nodes. A per-node `ResizeObserver` now records the real rendered size in the
  new `instance.measurements` signal, and geometry prefers
  `node.width ?? measured ?? 150` — so edges anchor correctly without hardcoded
  pixel widths (SSR/happy-dom fall back to explicit-or-default).
- **Dead Controls buttons.** The container's pan `pointerdown` handler
  `setPointerCapture`d on a press over the Controls, so the button never got
  pointerup and its click was swallowed — the zoom/fit buttons "did nothing".
  The pan now bails when the pointer lands on the flow's UI chrome (Controls /
  MiniMap / Panel) or any interactive control, mirroring the node `.nodrag`
  bail. The full-size viewport is `pointer-events: none` (nodes + edge paths opt
  back in) so it can't swallow panel/pan interactions.

All three are bisect-verified in real Chromium
(`flow/src/tests/edge-render.browser.test.tsx` + a strengthened
`e2e/app-showcase-flow.spec.ts` that now asserts the edge svg has a non-zero
rendered box and that a real coordinate click on the zoom button zooms).
