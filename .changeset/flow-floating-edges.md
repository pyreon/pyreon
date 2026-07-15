---
"@pyreon/flow": patch
---

fix(flow): floating edge endpoints — arrows meet nodes at the natural angle

Auto-routed edges used to dock at a fixed side's midpoint (e.g. the left-edge
centre), so the arrow always entered horizontally/vertically while the line
approached at an angle — a visible kink where the curve flattened into the
arrowhead.

Edges with no explicit handles (and no waypoints) now use **floating
endpoints**: each end connects where the source↔target centre line crosses that
node's perimeter, paired with the closest side for the bezier tangent — so the
edge leaves and enters at the real approach angle and the arrowhead
(`orient="auto"`) points along the line (React Flow's floating-edge model). It
recomputes reactively on drag. Nodes that declare `sourceHandles`/`targetHandles`
— or waypoint routes — keep their fixed docking points unchanged.

New pure helpers `getNodeIntersection` / `getFloatingEndpoints` are exported and
unit-tested; a bisect-verified browser test asserts an auto edge leaves the
source perimeter facing the target rather than the fixed side midpoint.
