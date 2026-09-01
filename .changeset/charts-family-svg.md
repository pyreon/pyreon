---
"@pyreon/charts": minor
---

Server-side SVG for the whole chart family: `pieToSvg`, `gaugeToSvg`, `radarToSvg`, `candlestickToSvg` and `heatmapToSvg` join `chartToSvg` — pure functions over the engine's geometry with `measureApprox` by default, so every chart type renders in an SSG build, a serverless function or an email pipeline, with the same derived accessible title/description contract.
