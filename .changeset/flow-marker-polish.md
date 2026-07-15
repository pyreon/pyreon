---
"@pyreon/flow": patch
---

fix(flow): unified, smaller, line-coloured edge arrowheads

Follow-up polish to the edge-rendering fix — the arrowheads now read as a
natural continuation of the line into the box:

- **Line-coloured by default.** `DEFAULT_MARKER_COLOR` is now the themeable
  `var(--pyreon-flow-edge, #999)` — the SAME var the edge stroke uses — so an
  unstyled arrow matches its line (a natural line→arrow→box connection) and
  re-themes with it, instead of a fixed grey that stood apart. The glyph applies
  colour via `style` because a `var()` is invalid in an SVG presentation
  attribute; `markerId` sanitizes the var to a stable dedup token distinct from
  an explicit `#999` (no def collision). An explicit `color` still wins.
- **Predictable, smaller size.** The `<marker>` now uses
  `markerUnits="userSpaceOnUse"`, so `width`/`height` are literal px rather than
  scaled by the (1.5px) edge stroke — a `width:10` arrow is 10px, not ~15px, and
  thick edges no longer balloon their arrows.

The docs flow examples drop their per-edge rainbow of custom markers and use the
clean unified default.
