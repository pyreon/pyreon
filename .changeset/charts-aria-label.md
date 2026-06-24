---
"@pyreon/charts": minor
---

`<Chart>` now accepts an `ariaLabel` prop. A chart renders to canvas/SVG, which is opaque to screen readers — without a text alternative it's entirely invisible. When `ariaLabel` is set, the container becomes `role="img"` with that `aria-label` (the WAI pattern for presenting a complex graphic as a single labeled image); without it the container stays bare (a nameless `role="img"` would be worse than none), so there's no change for existing charts. Pass a concise description of what the chart conveys, e.g. `ariaLabel="Bar chart: monthly revenue trending up"`.
