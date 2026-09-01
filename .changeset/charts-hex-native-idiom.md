---
'@pyreon/charts': patch
---

Engine: hex color decoding (radar's `withAlpha`, heat's ramp channel reader) now uses `charCodeAt` arithmetic instead of String Int-subscripts and `parseInt` radix — byte-identical rgba/rgb output on web (full test suite green), and the shapes Swift rejects outright ("cannot subscript String with an Int") are gone from the native draw-pipeline bundle.
