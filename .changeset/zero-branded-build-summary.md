---
'@pyreon/zero': minor
---

Branded end-of-build summary. Every production build now ends with an overview of what it actually produced — after the SSG prerender, SSR bundle, and deploy-adapter staging finish: client assets with raw + gzip sizes (entry chunks marked, sorted by gzip cost, long tails collapsed), per-kind totals, the server bundle, prerendered page count, and wall-clock time — in the Pyreon ember palette, degrading truecolor → 16-color → plain (`NO_COLOR`, non-TTY, `TERM=dumb` respected; `FORCE_COLOR` opts back in). The per-route mode table is colorized in the same palette. Informational only (can never fail a build), prints exactly once per top-level build (inner sub-builds stay silent), and `zero({ buildSummary: false })` opts out.
