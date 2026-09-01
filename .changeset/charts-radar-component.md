---
"@pyreon/charts": minor
---

`<RadarChart>` joins the plot engine's component family — one polygon per datum over shared spokes, each axis normalised by its own max so mixed-unit axes stay comparable. Ships with the same accessibility contract as its siblings (derived `aria-label` + offscreen data table), an optional wrapping legend, translucent fills with full-strength outlines, and the shared radial host sizing (parent-measured width + resize observer), which is now extracted to one module so the pie/gauge/radar trio cannot drift apart again.
