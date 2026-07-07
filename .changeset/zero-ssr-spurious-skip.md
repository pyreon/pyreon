---
"@pyreon/zero": patch
---

fix(zero): SSR post-step no longer emits a spurious "Skipping SSR build" warning during the SSG prerender sub-build. In `mode: 'ssr' | 'isr'`, the SSG plugin runs a nested prerender build to `<dist>/.zero-ssg-server` (which has no client `index.html`); the SSR plugin's `closeBundle` fired there and warned `[zero:ssr] Skipping SSR build — …/.zero-ssg-server/index.html not found`, even though the real (outer) SSR build succeeds and produces `dist/server/entry-server.js`. The ssg-plugin already skipped on the SSR flag; this makes the guard symmetric (ssr-plugin now also skips on `PYREON_ZERO_SSG_INNER_BUILD`). Reproduced + verified on the default `examples/ssr-showcase` build.
