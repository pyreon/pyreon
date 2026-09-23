---
'@pyreon/vite-plugin': patch
---

Production SSR builds now fold `process.env.NODE_ENV` to `"production"` inside `@pyreon/*` package files. Vite replaces that read in client builds but leaves it live in the SSR bundle, and under Node every `process.env` read is a native lookup (~145ns) — the framework's dev gates sit on hot paths (6 reads per signal create+read+write). Measured on Node 26: signal create+read+write 950ns → 158ns, and a 1,000-row SSR render whose rows hold a signal + computed 1.44ms → 0.74ms. The server bundle also drops its dev-only branches (the `cpa-pw-dash` example's server output: 404KB → 376KB). User code is untouched and keeps its runtime `NODE_ENV` semantics; rendered HTML is byte-identical.
