---
'@pyreon/flow': minor
---

`PyreonFlowEdgeCanvas` (iOS + Android) — prebuilt strokes, one viewport transform, and the Kotlin geometry verified for the first time.

A stroke now builds its `Path`, parses its color and converts its dash ONCE (at construction on Swift; lazily on first draw on Android), and the canvas applies the viewport pan/zoom as ONE transform on the drawing context instead of transforming every edge. On the v1 draw path at E = 9,999 the Swift closure cost 6.9 ms per draw — 3.3 ms re-parsing hex colors, 2.6 ms rebuilding and re-transforming paths — at gesture rate; the prebuilt form under a context transform measured ~0.25 ms on the same harness. `PyreonFlowEdgeStroke` and the canvas are `Equatable`, so an unchanged draw list can be skipped with `.equatable()`. Stroke width and dash are in flow units and scale with the zoom through the transform (same visual result as before). Android's stroke cap is now `Butt`, matching the web SVG layer and the Swift twin (v1's rounded caps were a per-target divergence).

Android: the pure geometry (`PyreonFlowEdgeSegment`, `PyreonFlowEdgeStroke`, the path builder, the hex parser) moved to `PyreonFlowEdgeGeometry.kt`, a `kotlinServices` group the co-source gate compiles AND runs a behaviour test against (functional `Path`/`Color`/`PathEffect` stubs) — v1's canvas file was `kotlinSdkOnly` and verified by nothing. The composable itself stays SDK-only and is ~20 lines. `pyreonFlowEdgePath(segments)` no longer takes the viewport; pass it to the canvas.
