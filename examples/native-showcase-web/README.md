# native-showcase-web

Web host for **Today**: [`../native-showcase/src/TodayApp.tsx`](../native-showcase/src/TodayApp.tsx) rendered to HTML at
build time (`src/entry-server.ts` + `scripts/prerender.ts`) and hydrated in the browser (`src/entry-client.tsx`).
`index.html` sets only page-level styling (page colour, font, the accent for the browser's own controls and focus ring).

```bash
bun run build   # client bundle, server bundle, then dist/index.html with the rendered app
bunx vite preview
```
