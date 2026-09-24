---
'@pyreon/ui-components': patch
---

Fix `RingProgress` silently vanishing for a NaN percentage.

The value clamp was `Math.max(0, Math.min(100, v ?? 0))`. `?? 0` catches null
and undefined but **not** NaN, and `Math.min(100, NaN)` is NaN — so a NaN
value produced `stroke-dashoffset="NaN"` on the arc.

That does not error. An SVG attribute set to NaN simply stops the arc
rendering, so the ring disappears at exactly the moment the data is
degenerate — a percentage computed as `done / total` is NaN when both are 0,
which is the ordinary empty state of any progress display.

`Infinity` was already handled (it clamps to 100); NaN and a non-numeric
value were not. The clamp now coerces and checks `Number.isFinite` before
clamping, falling back to 0.
