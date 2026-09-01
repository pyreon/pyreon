---
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

Chart Canvas executors: `PyreonChartCanvas` (SwiftUI `Canvas` / Compose `Canvas`) walks the chart engine's flat `PyreonDrawCmd` draw list — the native twins of the web canvas renderer, with identical dispatch (rect/line/polyline/polygon/circle/text), the same text-anchor semantics, and a shared color-string parser (`#rgb`, `#rrggbb`, `rgb()`, `rgba()`; an unknown color paints transparent rather than throwing). The RUNTIME owns the `PyreonChartPt`/`PyreonChartRect`/`PyreonDrawCmd` contract — the generated chart-engine geometry (gen-native-chart-engine, follow-up) references these types rather than re-declaring them, so concatenation can never collide.
