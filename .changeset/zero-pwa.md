---
'@pyreon/zero': minor
'@pyreon/mcp': patch
---

`zero({ pwa })`: emits `manifest.webmanifest` (linked with `theme-color` into every page) and generates `sw.js` after the output is final — before the deploy adapter stages it — precaching exactly the emitted content-hashed assets plus, under `mode: 'ssg'`, every prerendered page. Navigations are network-first, `<base><assetsDir>/` requests cache-first; a new worker waits by default (`skipWaiting: true` opts in). New client helper `registerServiceWorker({ onUpdate })` from `@pyreon/zero` (no-op in dev and SSR). The node/bun adapters now serve `sw.js` and `*.webmanifest` with `max-age=0, must-revalidate` instead of a 1-hour cache.
