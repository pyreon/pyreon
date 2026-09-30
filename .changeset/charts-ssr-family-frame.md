---
'@pyreon/charts': minor
---

Family charts ship their first frame from the server too. With `@pyreon/charts/svg` imported on the server, `<PieChart>`, `<TreemapChart>`, `<SankeyChart>`, `<FunnelChart>`, `<RadarChart>`, `<HeatmapChart>` and every other canvas-hosted family now render their chart as SVG in the SSR / SSG HTML — the same draw list the canvas paints at its final state, title, legend, right-to-left mirror and transpose included — so the page shows the chart before any script runs. Hydration adopts the frame and the first canvas paint removes it. A family chart now always renders inside its positioned wrapper (the frame placeholder has to be in the client tree for hydration to match), including with `accessibleTable={false}`.
