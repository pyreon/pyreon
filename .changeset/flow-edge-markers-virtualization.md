---
"@pyreon/flow": minor
---

Edge markers, render virtualization, and opt-out object-snapping (React Flow parity + drag perf).

- **Edge markers**: per-edge `markerStart` / `markerEnd` accept a bare `MarkerType`
  (`Arrow` open V / `ArrowClosed` filled triangle), a full `EdgeMarker`
  (`{ type, color?, width?, height?, strokeWidth? }`), or `null` for an explicit
  no-marker. Graph-wide default via `FlowConfig.defaultMarkerEnd` (`null` →
  arrowless by default). Identical configs are deduped into one shared `<defs>`
  entry; one `<marker orient="auto-start-reverse">` def serves both ends; the def
  set rebuilds reactively as edges change. New exports: `MarkerType`,
  `EdgeMarker`, `EdgeMarkerSpec`, and the pure helpers `resolveMarker` /
  `markerId` / `resolveEdgeMarkers` / `collectEdgeMarkers`. The previous single
  fixed arrowhead remains the default, so existing graphs render identically.
- **Render virtualization**: `FlowConfig.onlyRenderVisibleElements` (default off)
  culls nodes whose screen rect (± margin) is outside the viewport and edges with
  no visible endpoint, re-filtering reactively on pan/zoom.
- **Opt-out object-snapping**: `FlowConfig.snapToObjects` (default `true` — no
  behavior change) gates the helper-line align-to-other-nodes scan, an O(N) pass
  over every node on every drag frame. `snapToObjects: false` skips it for
  ≈3-4× faster drags on large graphs (measured 60-frame drag: N=1000
  1.34ms→0.31ms, N=3000 3.36ms→0.78ms).
