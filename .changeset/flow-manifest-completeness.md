---
"@pyreon/flow": patch
---

Complete the `@pyreon/flow` component API docs (manifest feeding MCP `get_api`). The component signatures were accurate but omitted real props, and the `Controls` default position was wrong:

- `Background` — added the `"cross"` variant and the `size` prop (dot radius / line thickness).
- `Controls` — added `showZoomIn` / `showZoomOut` / `showFitView` / `showLock` toggles + the zoom-level readout, and corrected the default position from `"bottom-right"` to `"bottom-left"`.
- `MiniMap` — `nodeColor` accepts a flat string OR a per-node function; added `width` / `height` / `style` / `class`.
- `Handle` / `Panel` — added `style` / `class` (and `Panel`'s `children` is optional).
- `Flow` — documented the `ariaLabel` prop (the accessible name for the focusable canvas).

No runtime change — docs/metadata only.
