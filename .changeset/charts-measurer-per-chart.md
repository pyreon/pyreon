---
'@pyreon/charts': patch
---

Text measurement keeps its memo across frames. Both canvas hosts built a fresh measurer with an empty cache inside every draw, so every update, tween frame and hover frame re-measured every tick label, legend entry and preset button (each miss also re-parsing the font twice). The measurer is now held per (canvas context, font family) in a WeakMap, so a repaint with the same strings calls `measureText` zero times, and the memo is released with the canvas.
