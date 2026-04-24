---
"@pyreon/runtime-server": patch
---

Add 7 dev-mode perf counters to the SSR path (no production cost — gated on `NODE_ENV !== 'production'`): `runtime-server.render` (per renderToString call), `runtime-server.stream` (per renderToStream call), `runtime-server.component` (per component vnode invocation in both sync and streaming paths), `runtime-server.escape` (HTML-escape call with special chars), `runtime-server.suspense.boundary` (per Suspense encountered), `runtime-server.suspense.fallback` (per boundary that hit the 30s timeout), `runtime-server.for.keyMarker` (per `<For>` item key marker emission). Previously no SSR instrumentation existed — any regression in the server render path would ship silently. Zero import coupling: counters emit via `globalThis.__pyreon_count__?.(...)`, picked up by `@pyreon/perf-harness` consumers.
