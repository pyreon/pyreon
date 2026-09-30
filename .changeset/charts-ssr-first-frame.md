---
'@pyreon/charts': minor
---

Server-rendered charts can show the chart before any script runs. With `@pyreon/charts/svg` imported in the server entry (`import '@pyreon/charts/svg'`), every `<Chart>` / `<PlotChart>` ships its first frame as SVG in the SSR or SSG HTML. Hydration adopts it, and the first canvas paint replaces it. It is opt-in through that import because the serializer is about 2 KB gzipped that no browser bundle needs; `<Chart>` itself carries only a ~0.2 KB slot. A chart without a `width` draws its server frame at 600px and scales it to the container.

`@pyreon/charts/svg` is now listed under `sideEffects`, so a bare `import '@pyreon/charts/svg'` is not tree-shaken away.
