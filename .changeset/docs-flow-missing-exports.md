---
"@pyreon/flow": patch
"@pyreon/mcp": patch
---

docs(flow): document 5 missing public exports in the manifest — `NodeResizer`, `NodeToolbar`, the `MarkerType`/`Position` enums, the edge-path helpers (`getBezierPath`/`getSmoothStepPath`/`getStraightPath`/`getStepPath`/`getWaypointPath`/`getEdgePath`/`getHandlePosition`/`getSmartHandlePositions`), and `computeLayout` — with source-verified signatures, examples, and footgun catalogs (object-not-tuple edge-path return, NodeToolbar is not a portal, computeLayout is async + non-mutating). Regenerates llms/MCP api-reference.
