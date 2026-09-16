---
"@pyreon/native-runtime-kotlin": minor
---

The chart canvas paints radial gradients: `PyreonChartGradient` carries a `radial` flag (the centre plus a point on the outer circle), and the mirror / transpose passes carry it through. The generated chart engine is regenerated from the shared TypeScript source.

The generated chart engine also carries the series state fields (`focus`, `emphasisColor`, `selectColor`, `blurOpacity`) and paints them through one `stateFill`.
