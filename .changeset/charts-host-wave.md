---
'@pyreon/charts': minor
---

`<PlotChart>` host wave: keyboard navigation (the canvas is focusable; Left/Right/Up/Down move a focus datum drawn with a focus ring and announced in a polite live region, Home/End jump, Enter/Space fire `onSelect`, Escape clears — on by default, `keyboard={false}` opts out), update animation (a data change of the same shape tweens from the previous frame to the new one through the pure `tweenValues` helper, `updateAnimation`/`updateDuration`, reduced-motion aware), and `zoomPresets` (Highcharts-style range-selector buttons under the plot that set the dataZoom window to the last N rows). The canvas exposes `data-pyreon-zoom` and `data-pyreon-presets` as stable hooks.
